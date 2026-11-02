export interface ReviewRange {
  startLine: number;
  endLine: number;
}

export interface ReviewUnitFile {
  path: string;
  role: 'implementation' | 'test' | 'configuration' | 'documentation' | 'other';
  reason: string;
  ranges: ReviewRange[];
  beforeRanges: ReviewRange[];
}

export interface ReviewUnit {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  rationaleEvidence: 'code' | 'description' | 'inferred';
  files: ReviewUnitFile[];
  changeTitles: string[];
  visualTitles: string[];
  simulationIds: string[];
  reviewPointTitles: string[];
}

export interface ReviewCodeSelection extends ReviewRange {
  path: string;
  side: 'original' | 'modified';
}

export function reviewUnitCoverage(units: readonly ReviewUnit[], paths: readonly string[]) {
  const assigned = new Set(units.flatMap((unit) => unit.files.map((file) => file.path)));
  return {
    linked: paths.filter((path) => assigned.has(path)).length,
    total: paths.length,
    remaining: paths.filter((path) => !assigned.has(path)),
  };
}
