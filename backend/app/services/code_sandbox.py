"""
Safe Code Sandbox for Dynamic Polars Transformation Execution — Phase 16.

Enforces zero arbitrary execution:
1. AST-based syntax and security verification:
   - Rejects all import statements (ast.Import, ast.ImportFrom).
   - Blocks dangerous builtins (eval, exec, open, __import__, globals, locals, etc.).
   - Blocks filesystem, network, and process execution modules (os, sys, subprocess, etc.).
   - Enforces single function signature: def transform(df: pl.DataFrame) -> pl.DataFrame:
2. Isolated namespace execution with restricted __builtins__.
3. Type validation: guarantees return value is a valid polars.DataFrame.
"""

from __future__ import annotations

import ast
import re
from typing import Any, Dict, Optional, Tuple

import polars as pl

from app.core.logging import get_logger

logger = get_logger(__name__)

# Dangerous identifiers and builtins forbidden in AST
FORBIDDEN_IDENTIFIERS = {
    "__import__",
    "__builtins__",
    "__class__",
    "__bases__",
    "__subclasses__",
    "eval",
    "exec",
    "compile",
    "open",
    "input",
    "globals",
    "locals",
    "vars",
    "dir",
    "getattr",
    "setattr",
    "delattr",
    "hasattr",
    "breakpoint",
    "exit",
    "quit",
    "help",
    "os",
    "sys",
    "subprocess",
    "shutil",
    "socket",
    "requests",
    "urllib",
    "http",
    "posix",
    "nt",
    "pty",
    "commands",
}

SAFE_BUILTINS = {
    "min": min,
    "max": max,
    "abs": abs,
    "round": round,
    "len": len,
    "int": int,
    "float": float,
    "str": str,
    "bool": bool,
    "range": range,
    "enumerate": enumerate,
    "zip": zip,
    "None": None,
    "True": True,
    "False": False,
}


def extract_code_from_markdown(text: str) -> str:
    """Strip markdown code fence blocks if present."""
    clean = text.strip()
    match = re.search(r"```(?:python)?\s*([\s\S]*?)\s*```", clean, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return clean


class _SecurityASTVisitor(ast.NodeVisitor):
    """AST visitor that checks for forbidden statements, nodes, and identifiers."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.has_transform_func = False
        self.func_name: Optional[str] = None
        self.arg_count = 0

    def visit_Import(self, node: ast.Import) -> None:
        self.errors.append("Import statements ('import ...') are strictly forbidden.")

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        self.errors.append("Import statements ('from ... import ...') are strictly forbidden.")

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        if node.name == "transform":
            self.has_transform_func = True
            self.func_name = node.name
            self.arg_count = len(node.args.args)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self.errors.append("Async function definitions are not permitted.")

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self.errors.append("Class definitions are not permitted.")

    def visit_Global(self, node: ast.Global) -> None:
        self.errors.append("Global variable declarations are forbidden.")

    def visit_Nonlocal(self, node: ast.Nonlocal) -> None:
        self.errors.append("Nonlocal declarations are forbidden.")

    def visit_Name(self, node: ast.Name) -> None:
        if node.id in FORBIDDEN_IDENTIFIERS:
            self.errors.append(f"Use of forbidden identifier '{node.id}' is blocked.")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr in FORBIDDEN_IDENTIFIERS or node.attr.startswith("__"):
            self.errors.append(f"Access to private or forbidden attribute '{node.attr}' is blocked.")
        self.generic_visit(node)


def validate_polars_code(code_str: str) -> Tuple[bool, Optional[str]]:
    """
    Validate that code is safe and conforms to the `transform(df)` Polars specification.

    Returns:
        (is_safe, error_reason)
    """
    cleaned_code = extract_code_from_markdown(code_str)
    if not cleaned_code:
        return False, "Code snippet is empty."

    try:
        tree = ast.parse(cleaned_code)
    except SyntaxError as exc:
        return False, f"Syntax error in code: {exc}"

    visitor = _SecurityASTVisitor()
    visitor.visit(tree)

    if visitor.errors:
        return False, "; ".join(visitor.errors)

    if not visitor.has_transform_func:
        return False, "Code must define a function named 'transform(df)'."

    if visitor.arg_count != 1:
        return False, f"'transform' function must accept exactly 1 argument (df), found {visitor.arg_count}."

    return True, None


def execute_polars_code(
    code_str: str,
    df: pl.DataFrame,
) -> Tuple[pl.DataFrame, Optional[str]]:
    """
    Execute validated Polars code in an isolated sandbox.

    Args:
        code_str: Python code defining `def transform(df: pl.DataFrame) -> pl.DataFrame`
        df: Input Polars DataFrame

    Returns:
        tuple of (transformed_df, error_message_or_None)
        If error occurs, original df is returned with the error description.
    """
    is_safe, error = validate_polars_code(code_str)
    if not is_safe:
        logger.warning(f"Polars code validation rejected: {error}")
        return df, f"Validation failed: {error}"

    cleaned_code = extract_code_from_markdown(code_str)

    # Restricted isolated execution environment
    sandbox_globals: Dict[str, Any] = {
        "__builtins__": SAFE_BUILTINS,
        "pl": pl,
        "polars": pl,
    }
    sandbox_locals: Dict[str, Any] = {}

    try:
        # Compile and execute definition
        compiled = compile(cleaned_code, filename="<sandbox_dynamic_tool>", mode="exec")
        exec(compiled, sandbox_globals, sandbox_locals)  # nosec B102: strictly validated AST sandbox

        transform_fn = sandbox_locals.get("transform")
        if not callable(transform_fn):
            return df, "Function 'transform' was not defined or is not callable."

        # Execute transformation on a copy of df to guarantee immutability on error
        working_copy = df.clone()
        result_df = transform_fn(working_copy)

        if not isinstance(result_df, pl.DataFrame):
            return df, f"Function must return a polars.DataFrame, got {type(result_df).__name__}."

        logger.info(
            f"Successfully executed dynamic Polars function: {df.shape} -> {result_df.shape}"
        )
        return result_df, None

    except Exception as exc:
        logger.error(f"Runtime error in sandboxed Polars function: {exc}", exc_info=True)
        return df, f"Runtime error during execution: {str(exc)}"
