#!/usr/bin/env python3
"""
Part 7.2 — Evaluation Benchmark Runner
Calls the live backend to seed the evaluation dataset and run accuracy benchmarks.
Target: 80%+ accuracy on 50 labelled CV-job pairs.

Usage:
  python run_evaluation.py [--url http://localhost:8000] [--password admin123]
"""
import sys, json, argparse
import urllib.request, urllib.error

def req(url, method="GET", body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()}")
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url",      default="http://localhost:8000")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", default="admin123")
    args = parser.parse_args()
    BASE = args.url.rstrip("/")

    print("\n" + "="*58)
    print("  HR System — Evaluation Benchmark Runner (Part 7.2)")
    print("="*58)

    # 1. Login
    print("\n[1/4] Authenticating...")
    auth = req(f"{BASE}/auth/login", "POST", {"username": args.username, "password": args.password})
    if not auth:
        print("  X  Login failed. Is the backend running?")
        sys.exit(1)
    token = auth["access_token"]
    print(f"  OK  Logged in as {auth['user']['username']} ({auth['user']['role']})")

    # 2. Seed dataset
    print("\n[2/4] Seeding 50-sample evaluation dataset...")
    seed = req(f"{BASE}/evaluation/seed-dataset", "POST", {}, token)
    if not seed:
        print("  X  Seeding failed")
        sys.exit(1)
    if "already" in seed.get("message", ""):
        print(f"  i  {seed['message']}")
    else:
        print(f"  OK  Seeded {seed.get('seeded', '?')} evaluation samples")

    # 3. Run evaluation
    print("\n[3/4] Running matching engine against dataset...")
    ev = req(f"{BASE}/evaluation/run", "POST", {}, token)
    if not ev:
        print("  X  Evaluation run failed")
        sys.exit(1)

    acc   = ev["accuracy_pct"]
    prec  = ev["precision_pct"]
    rec   = ev["recall_pct"]
    f1    = ev["f1_score"]
    total = ev["total_samples"]
    cm    = ev["confusion_matrix"]

    status = "PASSED" if acc >= 80 else "BELOW TARGET"

    print(f"\n{'='*58}")
    print(f"  EVALUATION RESULTS -- {status}")
    print(f"{'='*58}")
    print(f"  Samples Tested      : {total}")
    print(f"  Correct Predictions : {ev['correct_predictions']}")
    print(f"  Accuracy            : {acc}%  {'(target: >= 80%)' if acc < 80 else 'target met'}")
    print(f"  Precision           : {prec}%")
    print(f"  Recall              : {rec}%")
    print(f"  F1 Score            : {f1}%")
    print(f"\n  Confusion Matrix:")
    print(f"    True Positives  (shortlisted, correct) : {cm['TP']}")
    print(f"    True Negatives  (rejected, correct)    : {cm['TN']}")
    print(f"    False Positives (rejected as shortlist) : {cm['FP']}")
    print(f"    False Negatives (shortlist as rejected) : {cm['FN']}")

    # 4. Ablation study
    print(f"\n[4/4] Running ablation study (6 weight configurations)...")
    ab = req(f"{BASE}/evaluation/ablation", "GET", token=token)
    if ab:
        print(f"\n  {'Config':<35} {'Acc':>6} {'F1':>6}")
        print(f"  {'-'*49}")
        for cfg in ab["ablation"]:
            marker = " <- proposed" if "50/30/20" in cfg["config"] else ""
            if cfg["config"] == ab["best_config"] and "50/30/20" not in cfg["config"]:
                marker += " <- best"
            print(f"  {cfg['config']:<35} {cfg['accuracy_pct']:>5}% {cfg['f1_score']:>5}%{marker}")
        print(f"\n  Best config : {ab['best_config']}")
        print(f"  Conclusion  : {ab['conclusion']}")

    print(f"\n{'='*58}")
    if acc >= 80:
        print(f"  BENCHMARK PASSED -- {acc}% accuracy (>= 80% target)")
    else:
        print(f"  BENCHMARK FAILED -- {acc}% accuracy (target: 80%)")
        print(f"  Check MATCH_THRESHOLD in .env (current default: 70)")
    print(f"{'='*58}\n")

    sys.exit(0 if acc >= 80 else 1)

if __name__ == "__main__":
    main()
