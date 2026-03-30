type ProjectLike = Record<string, any> | null | undefined;

export function pickDisplayText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

export function extractProjectId(source: any) {
  return pickDisplayText(source?.projectId, source?.project_id, source?.project?.id);
}

export function getProjectDisplayTitle(project: ProjectLike, ...fallbacks: unknown[]) {
  return pickDisplayText(
    project?.titleAr,
    project?.nameAr,
    project?.title,
    project?.name,
    project?.titleEn,
    ...fallbacks
  );
}

export function getProjectDisplayTitleById(
  projectsMap: Record<string, any>,
  projectId: unknown,
  ...fallbacks: unknown[]
) {
  const normalizedProjectId = String(projectId ?? "").trim();
  const project = normalizedProjectId ? projectsMap[normalizedProjectId] : null;
  return getProjectDisplayTitle(project, ...fallbacks);
}

export function buildProjectsMap<T extends { id: string } & Record<string, any>>(rows: T[]) {
  const map: Record<string, T> = {};

  for (const row of rows) {
    map[row.id] = row;
  }

  return map;
}
