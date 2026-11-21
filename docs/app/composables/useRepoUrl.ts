/** The GitHub repository URL from `github` in the app config, or `''` when it is not set. */
export function useRepoUrl() {
  const { github } = useAppConfig();
  return github ? github.url : "";
}
