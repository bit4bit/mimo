## 1. Backend - Dependency Parser

- [x] 1.1 Create `src/impact/dependency-parser.ts` module with TypeScript types
- [x] 1.2 Implement `parseTypeScriptImports()` for ES6/CJS patterns
- [x] 1.3 Implement `parsePythonImports()` for import/from statements
- [x] 1.4 Implement `parseElixirImports()` for alias/import/use/require
- [x] 1.5 Create `extractTargetDirectory()` to resolve import paths to directories
- [x] 1.6 Add `isExternalDependency()` filter for node_modules/external packages

## 2. Backend - Dependency Change Calculator

- [x] 2.1 Create `DependencyChange` interface with source, target, files[], status
- [x] 2.2 Implement `buildDependencyGraph()` to parse all changed files
- [x] 2.3 Create `compareDependencyGraphs()` to diff upstream vs workspace
- [x] 2.4 Add `calculateDependencyChanges()` method to ImpactCalculator class
- [x] 2.5 Extend `ImpactMetrics` interface with `dependencies?: DependencyChanges`

## 3. Frontend - Dependency Display

- [x] 3.1 Add CSS styles for `.impact-dependency-section`, `.impact-dependency-line`, `.impact-dependency-files`
- [x] 3.2 Implement `renderDependencyChanges()` function in `chat.js`
- [x] 3.3 Format `+ source → target` for new dependencies
- [x] 3.4 Format `- source → target` for removed dependencies
- [x] 3.5 Group files under each dependency line with indentation
- [x] 3.6 Integrate `renderDependencyChanges()` into `renderImpactMetrics()`

## 4. Tests

- [x] 4.1 Test `parseTypeScriptImports()` with ES6 default, named, namespace imports
- [x] 4.2 Test `parseTypeScriptImports()` with CommonJS require
- [x] 4.3 Test `parsePythonImports()` with import and from statements
- [x] 4.4 Test `parseElixirImports()` with alias, import, use, require
- [x] 4.5 Test external dependency filtering
- [x] 4.6 Test `compareDependencyGraphs()` detects added dependencies
- [x] 4.7 Test `compareDependencyGraphs()` detects removed dependencies
- [x] 4.8 Test grouping multiple files under same dependency
- [x] 4.9 Test `renderDependencyChanges()` output format
- [x] 4.10 Integration test: full flow from file changes to rendered output

## 5. Integration & Polish

- [x] 5.1 Add error handling - graceful fallback when parsing fails
- [x] 5.2 Update API response type for `/sessions/:id/impact` endpoint
- [x] 5.3 Verify no breaking changes to existing impact metrics
- [x] 5.4 Run full test suite
