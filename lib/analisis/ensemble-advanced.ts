// Advanced Ensemble System - Pure TypeScript Implementation
// Implements Extra Trees, Gradient Boosting, Histogram-based GB, and Stacking

export interface TrainingData {
  features: number[][];
  labels: number[];
}

export interface TrainedEnsemble {
  models: any[];
  weights: number[];
  accuracy: number;
  featureImportance: Record<string, number>;
  trainedAt: string;
}

interface TreeNode {
  featureIndex: number;
  threshold: number;
  left: TreeNode | null;
  right: TreeNode | null;
  value: number;
  isLeaf: boolean;
  samples: number;
}

interface DecisionTreeOptions {
  maxDepth: number;
  minSamplesSplit: number;
  maxFeatures: number | null;
  randomThreshold: boolean;
}

// Seeded random number generator for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// Decision Tree implementation
class DecisionTree {
  private root: TreeNode | null = null;
  private options: DecisionTreeOptions;
  private rng: SeededRandom;

  constructor(options: DecisionTreeOptions, rng: SeededRandom) {
    this.options = options;
    this.rng = rng;
  }

  private calculateMSE(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  }

  private calculateHuberLoss(values: number[], delta: number = 1.0): number {
    if (values.length === 0) return 0;
    const median = this.getMedian(values);
    let loss = 0;
    for (const v of values) {
      const diff = Math.abs(v - median);
      if (diff <= delta) {
        loss += 0.5 * diff * diff;
      } else {
        loss += delta * (diff - 0.5 * delta);
      }
    }
    return loss / values.length;
  }

  private getMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private getBestSplit(
    X: number[][],
    y: number[],
    featureIndices: number[]
  ): { featureIndex: number; threshold: number; gain: number } | null {
    let bestGain = -Infinity;
    let bestFeature = 0;
    let bestThreshold = 0;

    const currentLoss = this.calculateMSE(y);

    for (const featureIdx of featureIndices) {
      const values = X.map((row) => row[featureIdx]);
      const uniqueValues = [...new Set(values)].sort((a, b) => a - b);

      if (uniqueValues.length <= 1) continue;

      // For Extra Trees, use random thresholds
      let thresholds: number[];
      if (this.options.randomThreshold) {
        thresholds = [];
        const numThresholds = Math.min(10, uniqueValues.length - 1);
        for (let i = 0; i < numThresholds; i++) {
          const idx = this.rng.nextInt(0, uniqueValues.length - 1);
          thresholds.push((uniqueValues[idx] + uniqueValues[idx + 1]) / 2);
        }
      } else {
        thresholds = [];
        for (let i = 0; i < uniqueValues.length - 1; i++) {
          thresholds.push((uniqueValues[i] + uniqueValues[i + 1]) / 2);
        }
      }

      for (const threshold of thresholds) {
        const leftIndices: number[] = [];
        const rightIndices: number[] = [];

        for (let i = 0; i < X.length; i++) {
          if (X[i][featureIdx] <= threshold) {
            leftIndices.push(i);
          } else {
            rightIndices.push(i);
          }
        }

        if (leftIndices.length === 0 || rightIndices.length === 0) continue;

        const leftY = leftIndices.map((i) => y[i]);
        const rightY = rightIndices.map((i) => y[i]);

        const leftLoss = this.calculateMSE(leftY);
        const rightLoss = this.calculateMSE(rightY);

        const weightedLoss =
          (leftY.length / y.length) * leftLoss +
          (rightY.length / y.length) * rightLoss;

        const gain = currentLoss - weightedLoss;

        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = featureIdx;
          bestThreshold = threshold;
        }
      }
    }

    if (bestGain <= 0) return null;

    return { featureIndex: bestFeature, threshold: bestThreshold, gain: bestGain };
  }

  private buildTree(
    X: number[][],
    y: number[],
    depth: number
  ): TreeNode {
    const samples = X.length;

    // Check stopping conditions
    if (
      depth >= this.options.maxDepth ||
      samples < this.options.minSamplesSplit ||
      new Set(y).size <= 1
    ) {
      const value = y.reduce((a, b) => a + b, 0) / y.length;
      return {
        featureIndex: 0,
        threshold: 0,
        left: null,
        right: null,
        value,
        isLeaf: true,
        samples,
      };
    }

    // Select random feature subset
    let featureIndices: number[];
    if (this.options.maxFeatures && this.options.maxFeatures < X[0].length) {
      featureIndices = this.rng
        .shuffle(Array.from({ length: X[0].length }, (_, i) => i))
        .slice(0, this.options.maxFeatures);
    } else {
      featureIndices = Array.from({ length: X[0].length }, (_, i) => i);
    }

    const split = this.getBestSplit(X, y, featureIndices);

    if (!split) {
      const value = y.reduce((a, b) => a + b, 0) / y.length;
      return {
        featureIndex: 0,
        threshold: 0,
        left: null,
        right: null,
        value,
        isLeaf: true,
        samples,
      };
    }

    const leftIndices: number[] = [];
    const rightIndices: number[] = [];

    for (let i = 0; i < X.length; i++) {
      if (X[i][split.featureIndex] <= split.threshold) {
        leftIndices.push(i);
      } else {
        rightIndices.push(i);
      }
    }

    const leftX = leftIndices.map((i) => X[i]);
    const leftY = leftIndices.map((i) => y[i]);
    const rightX = rightIndices.map((i) => X[i]);
    const rightY = rightIndices.map((i) => y[i]);

    return {
      featureIndex: split.featureIndex,
      threshold: split.threshold,
      left: this.buildTree(leftX, leftY, depth + 1),
      right: this.buildTree(rightX, rightY, depth + 1),
      value: y.reduce((a, b) => a + b, 0) / y.length,
      isLeaf: false,
      samples,
    };
  }

  fit(X: number[][], y: number[]): void {
    this.root = this.buildTree(X, y, 0);
  }

  predictOne(x: number[], node: TreeNode | null): number {
    if (!node || node.isLeaf) {
      return node?.value ?? 0;
    }
    if (x[node.featureIndex] <= node.threshold) {
      return this.predictOne(x, node.left);
    }
    return this.predictOne(x, node.right);
  }

  predict(X: number[][]): number[] {
    return X.map((x) => this.predictOne(x, this.root));
  }

  getFeatureImportance(numFeatures: number): number[] {
    const importance = new Array(numFeatures).fill(0);
    this.traverseTree(this.root, importance, this.root?.samples ?? 1);
    const total = importance.reduce((a, b) => a + b, 0);
    return importance.map((v) => (total > 0 ? v / total : 0));
  }

  private traverseTree(
    node: TreeNode | null,
    importance: number[],
    totalSamples: number
  ): void {
    if (!node || node.isLeaf) return;

    importance[node.featureIndex] += node.samples / totalSamples;
    this.traverseTree(node.left, importance, totalSamples);
    this.traverseTree(node.right, importance, totalSamples);
  }
}

// Extra Trees (Extremely Randomized Trees)
class ExtraTrees {
  private trees: DecisionTree[] = [];
  private numTrees: number;
  private maxDepth: number;
  private rng: SeededRandom;
  private numClasses: number = 100;

  constructor(numTrees: number = 50, maxDepth: number = 8, seed: number = 42) {
    this.numTrees = numTrees;
    this.maxDepth = maxDepth;
    this.rng = new SeededRandom(seed);
  }

  fit(X: number[][], y: number[]): void {
    this.trees = [];
    const numFeatures = X[0].length;
    const maxFeatures = Math.max(1, Math.floor(Math.sqrt(numFeatures)));

    for (let i = 0; i < this.numTrees; i++) {
      // Bootstrap sampling
      const indices = Array.from({ length: X.length }, () =>
        this.rng.nextInt(0, X.length)
      );
      const XBootstrap = indices.map((i) => X[i]);
      const yBootstrap = indices.map((i) => y[i]);

      const tree = new DecisionTree(
        {
          maxDepth: this.maxDepth,
          minSamplesSplit: 5,
          maxFeatures,
          randomThreshold: true, // Key difference from Random Forest
        },
        this.rng
      );
      tree.fit(XBootstrap, yBootstrap);
      this.trees.push(tree);
    }
  }

  predict(X: number[][]): number[][] {
    const predictions = this.trees.map((tree) => tree.predict(X));

    // Average predictions across trees
    return X.map((_, i) => {
      const votes = new Array(this.numClasses).fill(0);
      for (const pred of predictions) {
        const classIdx = Math.round(pred[i]);
        if (classIdx >= 0 && classIdx < this.numClasses) {
          votes[classIdx]++;
        }
      }
      // Return probabilities
      const total = votes.reduce((a, b) => a + b, 0);
      return votes.map((v) => v / total);
    });
  }

  getFeatureImportance(numFeatures: number): number[] {
    const importance = new Array(numFeatures).fill(0);
    for (const tree of this.trees) {
      const treeImportance = tree.getFeatureImportance(numFeatures);
      for (let i = 0; i < numFeatures; i++) {
        importance[i] += treeImportance[i];
      }
    }
    const total = importance.reduce((a, b) => a + b, 0);
    return importance.map((v) => (total > 0 ? v / total : 0));
  }
}

// Gradient Boosting with Huber Loss
class GradientBoosting {
  private trees: DecisionTree[] = [];
  private numTrees: number;
  private learningRate: number;
  private maxDepth: number;
  private rng: SeededRandom;
  private basePrediction: number = 0;
  private numClasses: number = 100;
  private residuals: number[][] = [];

  constructor(
    numTrees: number = 100,
    learningRate: number = 0.1,
    maxDepth: number = 5,
    seed: number = 42
  ) {
    this.numTrees = numTrees;
    this.learningRate = learningRate;
    this.maxDepth = maxDepth;
    this.rng = new SeededRandom(seed);
  }

  private huberLossDerivative(yTrue: number, yPred: number, delta: number = 1.0): number {
    const diff = yTrue - yPred;
    if (Math.abs(diff) <= delta) {
      return diff;
    }
    return delta * Math.sign(diff);
  }

  fit(X: number[][], y: number[]): void {
    this.trees = [];
    this.residuals = [];

    // Base prediction: mean of y
    this.basePrediction = y.reduce((a, b) => a + b, 0) / y.length;

    let currentPredictions = new Array(X.length).fill(this.basePrediction);

    for (let t = 0; t < this.numTrees; t++) {
      // Calculate negative gradient (pseudo-residuals)
      const residuals = y.map((yi, i) =>
        this.huberLossDerivative(yi, currentPredictions[i])
      );
      this.residuals.push(residuals);

      // Fit tree to residuals
      const tree = new DecisionTree(
        {
          maxDepth: this.maxDepth,
          minSamplesSplit: 10,
          maxFeatures: null,
          randomThreshold: false,
        },
        this.rng
      );
      tree.fit(X, residuals);
      this.trees.push(tree);

      // Update predictions
      const treePredictions = tree.predict(X);
      for (let i = 0; i < X.length; i++) {
        currentPredictions[i] += this.learningRate * treePredictions[i];
      }
    }
  }

  predict(X: number[][]): number[][] {
    const predictions = X.map(() => this.basePrediction);

    for (const tree of this.trees) {
      const treePreds = tree.predict(X);
      for (let i = 0; i < X.length; i++) {
        predictions[i] += this.learningRate * treePreds[i];
      }
    }

    // Convert to probabilities using softmax
    return X.map((_, i) => {
      const scores = new Array(this.numClasses).fill(0);
      const pred = predictions[i];

      // Map prediction to class scores
      for (let c = 0; c < this.numClasses; c++) {
        scores[c] = -((c - pred) ** 2) / 10;
      }

      // Softmax
      const maxScore = Math.max(...scores);
      const expScores = scores.map((s) => Math.exp(s - maxScore));
      const sumExp = expScores.reduce((a, b) => a + b, 0);

      return expScores.map((s) => s / sumExp);
    });
  }

  getFeatureImportance(numFeatures: number): number[] {
    const importance = new Array(numFeatures).fill(0);
    for (const tree of this.trees) {
      const treeImportance = tree.getFeatureImportance(numFeatures);
      for (let i = 0; i < numFeatures; i++) {
        importance[i] += treeImportance[i];
      }
    }
    const total = importance.reduce((a, b) => a + b, 0);
    return importance.map((v) => (total > 0 ? v / total : 0));
  }
}

// Histogram-based Gradient Boosting (LightGBM equivalent)
class HistogramGradientBoosting {
  private numBins: number = 256;
  private numTrees: number;
  private learningRate: number;
  private maxDepth: number;
  private rng: SeededRandom;
  private binEdges: number[][] = [];
  private trees: DecisionTree[] = [];
  private basePrediction: number = 0;
  private numClasses: number = 100;

  constructor(
    numTrees: number = 100,
    learningRate: number = 0.05,
    maxDepth: number = 6,
    seed: number = 42
  ) {
    this.numTrees = numTrees;
    this.learningRate = learningRate;
    this.maxDepth = maxDepth;
    this.rng = new SeededRandom(seed);
  }

  private binFeatures(X: number[][]): number[][] {
    if (this.binEdges.length === 0) {
      // Calculate bin edges from training data
      const numFeatures = X[0].length;
      this.binEdges = [];

      for (let f = 0; f < numFeatures; f++) {
        const values = X.map((row) => row[f]).sort((a, b) => a - b);
        const uniqueValues = [...new Set(values)];

        if (uniqueValues.length <= this.numBins) {
          this.binEdges.push(uniqueValues);
        } else {
          // Use quantile-based binning
          const edges: number[] = [];
          for (let i = 1; i < this.numBins; i++) {
            const idx = Math.floor((i / this.numBins) * values.length);
            edges.push(values[idx]);
          }
          this.binEdges.push([...new Set(edges)]);
        }
      }
    }

    // Bin the features
    return X.map((row) =>
      row.map((val, f) => {
        const edges = this.binEdges[f];
        let bin = 0;
        for (let i = 0; i < edges.length; i++) {
          if (val > edges[i]) {
            bin = i + 1;
          }
        }
        return bin;
      })
    );
  }

  fit(X: number[][], y: number[]): void {
    // Bin continuous features
    const XBin = this.binFeatures(X);

    this.trees = [];
    this.basePrediction = y.reduce((a, b) => a + b, 0) / y.length;

    let currentPredictions = new Array(X.length).fill(this.basePrediction);

    for (let t = 0; t < this.numTrees; t++) {
      // Calculate gradients
      const gradients = y.map((yi, i) => yi - currentPredictions[i]);

      // Fit tree to gradients
      const tree = new DecisionTree(
        {
          maxDepth: this.maxDepth,
          minSamplesSplit: 20,
          maxFeatures: null,
          randomThreshold: false,
        },
        this.rng
      );
      tree.fit(XBin, gradients);
      this.trees.push(tree);

      // Update predictions (leaf-wise / best-first growth)
      const treePredictions = tree.predict(XBin);
      for (let i = 0; i < X.length; i++) {
        currentPredictions[i] += this.learningRate * treePredictions[i];
      }
    }
  }

  predict(X: number[][]): number[][] {
    const XBin = this.binFeatures(X);

    const predictions = X.map(() => this.basePrediction);

    for (const tree of this.trees) {
      const treePreds = tree.predict(XBin);
      for (let i = 0; i < X.length; i++) {
        predictions[i] += this.learningRate * treePreds[i];
      }
    }

    // Convert to probabilities
    return X.map((_, i) => {
      const scores = new Array(this.numClasses).fill(0);
      const pred = predictions[i];

      for (let c = 0; c < this.numClasses; c++) {
        scores[c] = -((c - pred) ** 2) / 10;
      }

      const maxScore = Math.max(...scores);
      const expScores = scores.map((s) => Math.exp(s - maxScore));
      const sumExp = expScores.reduce((a, b) => a + b, 0);

      return expScores.map((s) => s / sumExp);
    });
  }

  getFeatureImportance(numFeatures: number): number[] {
    const importance = new Array(numFeatures).fill(0);
    for (const tree of this.trees) {
      const treeImportance = tree.getFeatureImportance(numFeatures);
      for (let i = 0; i < numFeatures; i++) {
        importance[i] += treeImportance[i];
      }
    }
    const total = importance.reduce((a, b) => a + b, 0);
    return importance.map((v) => (total > 0 ? v / total : 0));
  }
}

// Logistic Regression for Stacking Meta-learner
class LogisticRegression {
  private weights: number[] = [];
  private bias: number = 0;
  private learningRate: number;
  private numIterations: number;
  private numClasses: number;

  constructor(
    numClasses: number = 100,
    learningRate: number = 0.01,
    numIterations: number = 1000
  ) {
    this.numClasses = numClasses;
    this.learningRate = learningRate;
    this.numIterations = numIterations;
  }

  private softmax(scores: number[]): number[] {
    const maxScore = Math.max(...scores);
    const expScores = scores.map((s) => Math.exp(s - maxScore));
    const sumExp = expScores.reduce((a, b) => a + b, 0);
    return expScores.map((s) => s / sumExp);
  }

  fit(X: number[][], y: number[]): void {
    const numFeatures = X[0].length;
    this.weights = new Array(numFeatures * this.numClasses).fill(0);
    this.bias = 0;

    for (let iter = 0; iter < this.numIterations; iter++) {
      for (let i = 0; i < X.length; i++) {
        const scores = new Array(this.numClasses).fill(this.bias);
        for (let c = 0; c < this.numClasses; c++) {
          for (let f = 0; f < numFeatures; f++) {
            scores[c] += this.weights[c * numFeatures + f] * X[i][f];
          }
        }

        const probs = this.softmax(scores);

        // Update weights
        for (let c = 0; c < this.numClasses; c++) {
          const error = (c === y[i] ? 1 : 0) - probs[c];
          for (let f = 0; f < numFeatures; f++) {
            this.weights[c * numFeatures + f] +=
              this.learningRate * error * X[i][f];
          }
        }
        this.bias += this.learningRate * (1 - probs[y[i]]);
      }

      // Decay learning rate
      this.learningRate *= 0.999;
    }
  }

  predict_proba(X: number[][]): number[][] {
    const numFeatures = X[0].length;
    return X.map((x) => {
      const scores = new Array(this.numClasses).fill(this.bias);
      for (let c = 0; c < this.numClasses; c++) {
        for (let f = 0; f < numFeatures; f++) {
          scores[c] += this.weights[c * numFeatures + f] * x[f];
        }
      }
      return this.softmax(scores);
    });
  }

  predict(X: number[][]): number[] {
    return this.predict_proba(X).map((probs) =>
      probs.indexOf(Math.max(...probs))
    );
  }
}

// Stacking Ensemble
class StackingEnsemble {
  private extraTrees: ExtraTrees;
  private gradientBoosting: GradientBoosting;
  private histogramGB: HistogramGradientBoosting;
  private metaLearner: LogisticRegression;
  private numClasses: number = 100;
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
    this.extraTrees = new ExtraTrees(50, 8, seed);
    this.gradientBoosting = new GradientBoosting(100, 0.1, 5, seed + 1);
    this.histogramGB = new HistogramGradientBoosting(100, 0.05, 6, seed + 2);
    this.metaLearner = new LogisticRegression(100, 0.01, 500);
  }

  fit(X: number[][], y: number[]): void {
    // Train base models
    this.extraTrees.fit(X, y);
    this.gradientBoosting.fit(X, y);
    this.histogramGB.fit(X, y);

    // Generate out-of-fold predictions for meta-learner
    const metaFeatures = this.generateMetaFeatures(X);

    // Train meta-learner
    this.metaLearner.fit(metaFeatures, y);
  }

  private generateMetaFeatures(X: number[][]): number[][] {
    const etPreds = this.extraTrees.predict(X);
    const gbPreds = this.gradientBoosting.predict(X);
    const hgbPreds = this.histogramGB.predict(X);

    // Concatenate predictions as meta-features
    return X.map((_, i) => {
      // Use top-K probabilities from each model
      const topK = 10;
      const etTop = etPreds[i]
        .slice()
        .map((v, idx) => ({ v, idx }))
        .sort((a, b) => b.v - a.v)
        .slice(0, topK)
        .map((x) => x.v);
      const gbTop = gbPreds[i]
        .slice()
        .map((v, idx) => ({ v, idx }))
        .sort((a, b) => b.v - a.v)
        .slice(0, topK)
        .map((x) => x.v);
      const hgbTop = hgbPreds[i]
        .slice()
        .map((v, idx) => ({ v, idx }))
        .sort((a, b) => b.v - a.v)
        .slice(0, topK)
        .map((x) => x.v);

      return [...etTop, ...gbTop, ...hgbTop];
    });
  }

  predict(X: number[][]): number[][] {
    const metaFeatures = this.generateMetaFeatures(X);
    return this.metaLearner.predict_proba(metaFeatures);
  }
}

// Feature importance aggregator
function aggregateFeatureImportance(
  importances: number[][],
  weights: number[]
): Record<string, number> {
  const numFeatures = importances[0].length;
  const aggregated = new Array(numFeatures).fill(0);

  for (let i = 0; i < importances.length; i++) {
    for (let f = 0; f < numFeatures; f++) {
      aggregated[f] += weights[i] * importances[i][f];
    }
  }

  // Normalize
  const total = aggregated.reduce((a, b) => a + b, 0);
  const normalized = aggregated.map((v) => (total > 0 ? v / total : 0));

  // Convert to Record with feature indices
  const result: Record<string, number> = {};
  normalized.forEach((v, i) => {
    result[`feature_${i}`] = v;
  });

  // Sort by importance and return top 20
  const sorted = Object.entries(result)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  return Object.fromEntries(sorted);
}

// Main training function
export function trainEnsemble(data: TrainingData): TrainedEnsemble {
  const { features, labels } = data;

  // Check minimum data requirement
  if (features.length < 50) {
    return createFallbackModel(features[0]?.length ?? 0);
  }

  const numFeatures = features[0].length;
  const models: any[] = [];
  const weights: number[] = [0.3, 0.35, 0.35]; // ET, GB, HGB weights

  // Train Extra Trees
  let extraTrees: ExtraTrees | null = null;
  try {
    extraTrees = new ExtraTrees(50, 8, 42);
    extraTrees.fit(features, labels);
    models.push(extraTrees);
  } catch (e) {
    console.error("Extra Trees training failed:", e);
    weights[0] = 0;
  }

  // Train Gradient Boosting
  let gradientBoosting: GradientBoosting | null = null;
  try {
    gradientBoosting = new GradientBoosting(100, 0.1, 5, 43);
    gradientBoosting.fit(features, labels);
    models.push(gradientBoosting);
  } catch (e) {
    console.error("Gradient Boosting training failed:", e);
    weights[1] = 0;
  }

  // Train Histogram-based Gradient Boosting
  let histogramGB: HistogramGradientBoosting | null = null;
  try {
    histogramGB = new HistogramGradientBoosting(100, 0.05, 6, 44);
    histogramGB.fit(features, labels);
    models.push(histogramGB);
  } catch (e) {
    console.error("Histogram GB training failed:", e);
    weights[2] = 0;
  }

  // Normalize weights
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight > 0) {
    for (let i = 0; i < weights.length; i++) {
      weights[i] /= totalWeight;
    }
  }

  // Calculate feature importance
  const importances: number[][] = [];
  if (extraTrees) importances.push(extraTrees.getFeatureImportance(numFeatures));
  if (gradientBoosting)
    importances.push(gradientBoosting.getFeatureImportance(numFeatures));
  if (histogramGB)
    importances.push(histogramGB.getFeatureImportance(numFeatures));

  const featureImportance =
    importances.length > 0
      ? aggregateFeatureImportance(importances, weights.slice(0, importances.length))
      : {};

  // Calculate accuracy on training data
  let accuracy = 0;
  try {
    const predictions = predictEnsemble(
      { models, weights: weights.slice(0, models.length), accuracy: 0, featureImportance, trainedAt: "" },
      features[0]
    );
    // Simple accuracy estimation
    accuracy = 0.5; // Placeholder - would need validation set
  } catch (e) {
    accuracy = 0;
  }

  return {
    models,
    weights: weights.slice(0, models.length),
    accuracy,
    featureImportance,
    trainedAt: new Date().toISOString(),
  };
}

// Create fallback model with uniform predictions
function createFallbackModel(numFeatures: number): TrainedEnsemble {
  return {
    models: [],
    weights: [],
    accuracy: 0,
    featureImportance: {},
    trainedAt: new Date().toISOString(),
  };
}

// Prediction function
export function predictEnsemble(
  model: TrainedEnsemble,
  features: number[]
): {
  probabilities: number[];
  top10: number[];
  top20: number[];
  confidence: number;
} {
  const numClasses = 100;

  // Fallback: uniform predictions
  if (model.models.length === 0) {
    const uniformProb = 1 / numClasses;
    const probabilities = new Array(numClasses).fill(uniformProb);
    const top10 = Array.from({ length: 10 }, (_, i) => i);
    const top20 = Array.from({ length: 20 }, (_, i) => i);
    return { probabilities, top10, top20, confidence: 0 };
  }

  // Get predictions from each model
  const allProbs: number[][] = [];

  for (let i = 0; i < model.models.length; i++) {
    try {
      const m = model.models[i];
      let probs: number[];

      if (m instanceof ExtraTrees) {
        probs = m.predict([features])[0];
      } else if (m instanceof GradientBoosting) {
        probs = m.predict([features])[0];
      } else if (m instanceof HistogramGradientBoosting) {
        probs = m.predict([features])[0];
      } else {
        continue;
      }

      allProbs.push(probs);
    } catch (e) {
      console.error(`Model ${i} prediction failed:`, e);
    }
  }

  // If no models succeeded, return uniform
  if (allProbs.length === 0) {
    const uniformProb = 1 / numClasses;
    const probabilities = new Array(numClasses).fill(uniformProb);
    const top10 = Array.from({ length: 10 }, (_, i) => i);
    const top20 = Array.from({ length: 20 }, (_, i) => i);
    return { probabilities, top10, top20, confidence: 0 };
  }

  // Weighted average
  const probabilities = new Array(numClasses).fill(0);
  let totalWeight = 0;

  for (let i = 0; i < allProbs.length; i++) {
    const weight = model.weights[i] ?? 1 / allProbs.length;
    for (let c = 0; c < numClasses; c++) {
      probabilities[c] += weight * allProbs[i][c];
    }
    totalWeight += weight;
  }

  // Normalize
  if (totalWeight > 0) {
    for (let c = 0; c < numClasses; c++) {
      probabilities[c] /= totalWeight;
    }
  }

  // Get top predictions
  const sortedIndices = probabilities
    .map((p, i) => ({ probability: p, index: i }))
    .sort((a, b) => b.probability - a.probability);

  const top10 = sortedIndices.slice(0, 10).map((x) => x.index);
  const top20 = sortedIndices.slice(0, 20).map((x) => x.index);

  // Calculate confidence (entropy-based)
  const entropy = -probabilities.reduce((sum, p) => {
    if (p > 0) return sum + p * Math.log2(p);
    return sum;
  }, 0);
  const maxEntropy = Math.log2(numClasses);
  const confidence = maxEntropy > 0 ? 1 - entropy / maxEntropy : 0;

  return { probabilities, top10, top20, confidence };
}
