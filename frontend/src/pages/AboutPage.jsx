import React, { useState } from 'react'
import {
  Sparkles,
  Bot,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Terminal,
  History,
  GitCompare,
  Brain,
  FileCheck,
  Lock,
  Cpu,
  Database,
  ArrowRight,
  CheckCircle2,
  Code,
  Layers,
  Scale,
  Award,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

export default function AboutPage({ onNavigate }) {
  const [expandedMode, setExpandedMode] = useState(null)

  const toggleMode = (idx) => {
    setExpandedMode(expandedMode === idx ? null : idx)
  }

  const coreFunctions = [
    {
      id: "agent_loop",
      title: "Autonomous Multi-Step AI Cleaning Loop",
      icon: <Sparkles size={20} color="var(--emerald-primary)" />,
      badge: "Autonomous Autopilot",
      shortDesc: "Iterative defect repair loop that plans actions, executes Polars tools, re-profiles quality, and auto-rolls back regressions.",
      whatItDoes: "Analyzes dataset statistics, formulates a multi-action cleaning plan, executes deterministic Polars tools step-by-step, measures quality improvements, and automatically reverts any action that worsens data health.",
      howItWorks: "At each iteration (up to 5 iterations), a lightweight statistical fingerprint (~800 tokens) is reasoned over by high-performance LLM engines. Verified tool actions (deduplication, median/mode imputation, type casting, category normalization) are executed deterministically. After execution, the dataset is re-profiled. If the composite Quality Score drops by >5.0 points or a catastrophic row drop occurs, the engine automatically rolls back to the previous iteration and prompts the AI with the failure reason to explore alternate strategies.",
      mostImportant: "Completely self-healing with zero risk of silent data degradation. High-risk operations (dropping columns, severe row deletion) pause the pipeline for explicit human approval before execution.",
    },
    {
      id: "chat_clean",
      title: "Intent-Guided Chat & Custom Tasks",
      icon: <Bot size={20} color="#818cf8" />,
      badge: "Natural Language Engine",
      shortDesc: "Translates plain English user requirements into verified Polars functions with AST security sandboxing.",
      whatItDoes: "Allows users to instruct the system in natural language (e.g. 'cap tenure at 72 months, calculate charge_per_month, and drop customer_id'). The agent maps standard requirements to registered tools and synthesizes safe custom Polars functions when standard tools are insufficient.",
      howItWorks: "Dynamic transformations are restricted to a strict signature: def transform(df: pl.DataFrame) -> pl.DataFrame. Before any code is executed, an Abstract Syntax Tree (AST) validator verifies that zero imports (ast.Import, ast.ImportFrom) and zero dangerous builtins (eval, exec, open, os, sys, subprocess) are present. Execution is sandboxed in a restricted memory scope with memory and 5-second timeout limits. Dynamic functions are classified as HIGH-risk and require human approval before applying.",
      mostImportant: "Combines the flexibility of natural language with enterprise-grade sandboxing. No unverified code is ever executed directly on your dataset.",
    },
    {
      id: "instant_deterministic",
      title: "Instant Standard Clean",
      icon: <Zap size={20} color="#f59e0b" />,
      badge: "Zero-Latency Heuristic",
      shortDesc: "0-second deterministic heuristic cleaning for rapid baseline remediation without AI overhead.",
      whatItDoes: "Instantly applies a battery of battle-tested data cleaning rules tailored to your specified task (Classification, Regression, Clustering, or General).",
      howItWorks: "Executes in memory via pure Polars: removes exact duplicate records, imputes missing numeric values with medians, populates categorical nulls with modes, standardizes casing and strips trailing whitespace, and casts misparsed string numbers to numeric floats/integers.",
      mostImportant: "Zero token consumption and instantaneous execution. Perfect for clean baseline initialization or fast automated batch jobs.",
    },
    {
      id: "diagnostic_only",
      title: "Read-Only Diagnostic Reasoning",
      icon: <Terminal size={20} color="#38bdf8" />,
      badge: "Zero-Mutation Analysis",
      shortDesc: "Comprehensive AI data health evaluation and strategic cleaning roadmap without altering a single byte.",
      whatItDoes: "Inspects your dataset schema and issue inventory to provide an A-to-F letter health grade, readiness score (0–100), detailed defect severity breakdown, and prioritized recommendations.",
      howItWorks: "Evaluates ground-truth metadata from the Polars profiler (null distributions, skew, cardinality, duplicates) and generates structured insights without invoking transformation tools or generating new dataset versions.",
      mostImportant: "100% read-only. Use this mode when you need an expert quality audit before deciding whether or how to clean your data.",
    },
    {
      id: "version_history",
      title: "Reversible Version Lineage & Rollback",
      icon: <History size={20} color="#a855f7" />,
      badge: "Immutable Lineage",
      shortDesc: "Non-destructive version control where every cleaning batch creates a new immutable snapshot.",
      whatItDoes: "Maintains a full chronological history of your dataset (Original v0, v1, v2...). Allows instant rollback to any parent or historical version in one click.",
      howItWorks: "Every successful cleaning iteration snapshots the dataset to compressed Parquet format in object storage. Lineage metadata tracks parent-child relationships, quality scores, applied tools, and row count changes. Rolling back re-points working pointers without destroying historical artifacts.",
      mostImportant: "Your original uploaded dataset is permanent and immutable. You can experiment freely knowing you can always revert to any previous state.",
    },
    {
      id: "comparison",
      title: "Before / After Verification Engine",
      icon: <GitCompare size={20} color="var(--emerald-primary)" />,
      badge: "4-Factor Scoring Delta",
      shortDesc: "Transparent mathematical comparison engine measuring exactly how transformations affected data quality.",
      whatItDoes: "Compares any two dataset versions across a transparent 4-factor Quality Score (0–100) and produces an itemized delta table of every column and metric.",
      howItWorks: "Calculates: Completeness Score (35% weight, based on null reduction), Type Consistency Score (25% weight, valid datatypes), Uniqueness Score (20% weight, duplicate removal), and Validity Score (20% weight, range/format compliance). Checks for target class distribution shifts (>20% relative drift flagged).",
      mostImportant: "No black-box mystery numbers. Every score change is mathematically backed by verified column-level deltas.",
    },
    {
      id: "ml_evaluation",
      title: "ML Holdout Generalization Benchmark",
      icon: <Brain size={20} color="#06b6d4" />,
      badge: "Zero-Leakage Benchmark",
      shortDesc: "Evaluates whether cleaning improved machine learning generalization on strictly isolated holdout test data.",
      whatItDoes: "Trains baseline models (RandomForest, Linear Regression, Logistic Regression) on raw vs. cleaned datasets to prove whether cleaning improved predictive performance (F1, Accuracy, R², RMSE).",
      howItWorks: "An 80/20 train/test holdout split is performed strictly before cleaning. Cleaning transformations are evaluated on the training split, and the identical held-out test set is evaluated. Surrogate keys and leaking identifiers are automatically stripped.",
      mostImportant: "Guarantees zero target leakage and zero test-set contamination. Provides empirical proof that data preparation improved real-world model accuracy.",
    },
    {
      id: "audit_report",
      title: "Comprehensive Audit & Compliance Report",
      icon: <FileCheck size={20} color="var(--emerald-primary)" />,
      badge: "Compliance Export",
      shortDesc: "Generates verifiable post-cleaning audit documents exportable as structured JSON or print-ready HTML/PDF.",
      whatItDoes: "Compiles all detected issues, agent decisions, human approvals, executed tools, 4-factor quality deltas, and ML benchmarks into a single verifiable compliance document.",
      howItWorks: "Available via API (JSON/HTML) and the UI with single-click export. Includes responsive print stylesheets (@media print) for direct PDF printing or corporate reporting.",
      mostImportant: "Provides data teams and compliance officers with complete traceability and accountability for every row and column modification.",
    },
  ]

  const safetyGuarantees = [
    {
      rule: "Deterministic Mathematical Measurement",
      desc: "All counts, null percentages, quantiles, and variances are calculated by Polars lazy streaming engines directly on byte streams. AI models are strictly prohibited from calculating or hallucinating numeric statistics.",
      icon: <Scale size={18} color="var(--emerald-primary)" />,
    },
    {
      rule: "Immutable Raw Dataset Storage",
      desc: "Original uploaded files are permanently marked read-only in object storage. All cleaning operations write to versioned snapshots (v1, v2...), guaranteeing that your source data is never overwritten or lost.",
      icon: <Lock size={18} color="var(--accent-blue)" />,
    },
    {
      rule: "Human Approval for High-Risk Operations",
      desc: "Operations that delete columns, prune large quantities of rows, or clip potential outliers trigger an approval gate. The pipeline pauses and presents the exact reasoning, impacted columns, and confidence score for user review.",
      icon: <ShieldAlert size={18} color="#f59e0b" />,
    },
    {
      rule: "AST Security Sandbox for Custom Transformations",
      desc: "User instructions that require custom Python code are subjected to strict Abstract Syntax Tree (AST) validation. All imports, system calls, network sockets, and file system access are rejected before execution.",
      icon: <Code size={18} color="#818cf8" />,
    },
    {
      rule: "Target Leakage & Surrogate Key Defense",
      desc: "In supervised machine learning tasks, unique serial identifiers, auto-increment keys, and columns with correlation |r| ≥ 0.90 with the target are flagged or removed to prevent models from memorizing index shortcuts.",
      icon: <ShieldCheck size={18} color="var(--emerald-primary)" />,
    },
    {
      rule: "Strict 80/20 Holdout ML Isolation",
      desc: "Machine learning evaluations split data before cleaning decisions are finalized. Test data is never used during imputation or outlier calculation, preventing synthetic overfitting and biased metrics.",
      icon: <Brain size={18} color="#06b6d4" />,
    },
  ]

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.75rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <span className="badge badge-muted">
            Architecture & Methodology Guide
          </span>
          <span className="badge badge-green">
            Enterprise Grade
          </span>
        </div>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: '0.85rem', lineHeight: 1.25 }}>
          The Clean-It Methodology & Function Guide
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: 1.6, maxWidth: '800px' }}>
          A complete guide to our deterministic data engineering engine, autonomous self-healing loops, holdout ML benchmarking, and governance architecture.
        </p>
      </div>

      {/* The 3 Core Architectural Tiers */}
      <div className="card" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Cpu size={18} color="var(--emerald-primary)" />
          Deterministic Division of Labour
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.55 }}>
          Clean-It enforces a strict separation of concerns between reasoning, mathematical computation, and quality verification.
        </p>

        <div className="grid-3" style={{ gap: '1rem' }}>
          <div style={{ background: 'var(--bg-main)', padding: '1.1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
              <Bot size={16} color="#818cf8" />
              1. Reasoning Tier
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.55, margin: 0 }}>
              Reasons over compact statistical profiles (~800 tokens) to plan remediation strategies. <strong>Never</strong> calculates statistics or guesses numbers.
            </p>
          </div>

          <div style={{ background: 'var(--bg-main)', padding: '1.1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
              <Cpu size={16} color="var(--emerald-primary)" />
              2. Polars Execution Tier
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.55, margin: 0 }}>
              Profiles and executes verified transformations directly in memory using vectorized Polars lazy frames. Calculates ground-truth counts with zero numeric error.
            </p>
          </div>

          <div style={{ background: 'var(--bg-main)', padding: '1.1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
              <ShieldCheck size={16} color="var(--accent-blue)" />
              3. Verification & Safety Tier
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.55, margin: 0 }}>
              Evaluates before-and-after quality deltas, detects regressions, gates high-risk operations behind human approval, and triggers automatic rollbacks.
            </p>
          </div>
        </div>
      </div>

      {/* Comprehensive Function Guide (The 8 Modes) */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              Feature Deep-Dive
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
              Complete Guide to the 8 Cleaning Center Capabilities
            </h2>
          </div>
          <button
            onClick={() => onNavigate('studio')}
            className="btn btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            Launch Data Studio <ArrowRight size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {coreFunctions.map((fn, idx) => {
            const isExpanded = expandedMode === idx
            return (
              <div
                key={fn.id}
                className="card"
                style={{
                  padding: '1.25rem 1.5rem',
                  border: isExpanded ? '1px solid var(--emerald-primary)' : '1px solid var(--border-medium)',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div
                  onClick={() => toggleMode(idx)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer', gap: '1rem' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                    <div style={{
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '0.1rem',
                    }}>
                      {fn.icon}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                          {fn.title}
                        </h3>
                        <span className="badge badge-muted" style={{ fontSize: '0.68rem' }}>
                          {fn.badge}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', margin: 0, lineHeight: 1.5 }}>
                        {fn.shortDesc}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    style={{ padding: '0.25rem 0.5rem', color: 'var(--text-muted)' }}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Detailed Breakdown */}
                {isExpanded && (
                  <div style={{
                    marginTop: '1.25rem',
                    paddingTop: '1.25rem',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    fontSize: '0.825rem',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <CheckCircle2 size={13} color="var(--emerald-primary)" /> What It Does
                      </div>
                      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                        {fn.whatItDoes}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Cpu size={13} color="var(--accent-blue)" /> How It Works Under the Hood
                      </div>
                      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                        {fn.howItWorks}
                      </div>
                    </div>

                    <div style={{
                      background: 'var(--bg-main)',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      borderLeft: '3px solid var(--emerald-primary)',
                    }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                        💡 Most Important Stuff to Know
                      </div>
                      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {fn.mostImportant}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Safety & Governance Principles */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Data Governance
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.25rem' }}>
          Enterprise Safety Guarantees
        </h2>

        <div className="grid-2" style={{ gap: '1rem' }}>
          {safetyGuarantees.map((g, gIdx) => (
            <div key={gIdx} className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                {g.icon}
                {g.rule}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.55, margin: 0 }}>
                {g.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Transparent Quality Score Formula */}
      <div className="card" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Award size={18} color="var(--emerald-primary)" />
          Transparent Quality Score Methodology (0–100 Scale)
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginBottom: '1.25rem', lineHeight: 1.55 }}>
          Our composite score is calculated using an open, deterministic mathematical formula so you always know why your score changed:
        </p>

        <div style={{
          background: 'var(--bg-main)',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-medium)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
          color: 'var(--text-primary)',
          marginBottom: '1.25rem',
          overflowX: 'auto',
        }}>
          Quality Score = (Completeness × 0.35) + (Type Consistency × 0.25) + (Uniqueness × 0.20) + (Validity × 0.20)
        </div>

        <div className="grid-2" style={{ gap: '0.85rem', fontSize: '0.8rem' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <strong>Completeness (35% Weight):</strong> Measures the percentage of non-null cells across all columns. 100% means zero missing values.
          </div>
          <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <strong>Type Consistency (25% Weight):</strong> Percentage of columns correctly typed without string-stored numbers or corrupted timestamps.
          </div>
          <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <strong>Uniqueness (20% Weight):</strong> Evaluates non-duplicate row proportions. 100% indicates zero duplicate entries.
          </div>
          <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <strong>Validity (20% Weight):</strong> Verifies domain constraint adherence (non-negative prices, valid age bounds, valid email/date formatting).
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(2, 132, 199, 0.08))',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        borderRadius: 'var(--radius-sm)',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
          Ready to prepare clean, model-ready datasets?
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '550px', margin: '0 auto 1.5rem', lineHeight: 1.55 }}>
          Upload any CSV, JSON, or Parquet file in the Data Studio and let our deterministic engine profile and clean your data with full version control.
        </p>
        <button
          onClick={() => onNavigate('studio')}
          className="btn btn-primary"
          style={{ padding: '0.65rem 1.75rem', fontSize: '0.9rem' }}
        >
          Open Data Studio <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
