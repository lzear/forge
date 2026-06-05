export declare const getReleaseLine: (
  changeset: { id: string; summary: string },
  type: 'major' | 'minor' | 'patch',
) => Promise<string>

export declare const getDependencyReleaseLine: () => Promise<string>
