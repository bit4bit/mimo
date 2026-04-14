import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, mkdirSync, writeFileSync, chmodSync } from "fs";

describe("Impact Buffer Tests", () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-impact-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });
    mkdirSync(join(testHome, "projects"), { recursive: true });
    mkdirSync(join(testHome, "bin"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  describe("SccService", () => {
    it("should detect platform correctly", async () => {
      const { SccService } = await import("../src/impact/scc-service.ts");
      const service = new SccService(join(testHome, "bin", "scc"));
      const platform = service.detectPlatform();
      
      expect(platform).toBeDefined();
      expect(platform.os).toBeOneOf(["Linux", "Darwin", "Windows"]);
      expect(platform.arch).toBeOneOf(["x86_64", "arm64"]);
    });

    it("should generate correct download URL", async () => {
      const { SccService } = await import("../src/impact/scc-service.ts");
      const service = new SccService(join(testHome, "bin", "scc"));
      const platform = { os: "Linux" as const, arch: "x86_64" as const };
      const url = service.getDownloadUrl(platform);
      
      expect(url).toContain("github.com/boyter/scc");
      expect(url).toContain("Linux");
      expect(url).toContain("x86_64");
    });

    it("should initially report scc as not installed", async () => {
      const { SccService } = await import("../src/impact/scc-service.ts");
      const service = new SccService(join(testHome, "bin", "scc"));
      expect(service.isInstalled()).toBe(false);
    });

    it("should detect installed scc binary", async () => {
      const { SccService } = await import("../src/impact/scc-service.ts");
      const sccPath = join(testHome, "bin", "scc");
      const service = new SccService(sccPath);
      
      // Create a mock scc binary
      mkdirSync(join(testHome, "bin"), { recursive: true });
      writeFileSync(sccPath, "#!/bin/bash\necho 'mock scc'");
      chmodSync(sccPath, 0o755);
      
      expect(service.isInstalled()).toBe(true);
    });

    it("should parse scc JSON output correctly", async () => {
      const { SccService } = await import("../src/impact/scc-service.ts");
      const sccPath = join(testHome, "bin", "scc");
      const service = new SccService(sccPath);
      
      // Create a mock scc binary that outputs the correct JSON format
      mkdirSync(join(testHome, "bin"), { recursive: true });
      const mockSccOutput = JSON.stringify([
        {
          "Name": "Python",
          "Bytes": 156,
          "CodeBytes": 0,
          "Lines": 10,
          "Code": 8,
          "Comment": 0,
          "Blank": 2,
          "Complexity": 3,
          "Count": 1,
          "WeightedComplexity": 0,
          "Files": [
            {
              "Language": "Python",
              "PossibleLanguages": ["Python"],
              "Filename": "hello.py",
              "Extension": "py",
              "Location": "hello.py",
              "Symlocation": "",
              "Bytes": 156,
              "Lines": 10,
              "Code": 8,
              "Comment": 0,
              "Blank": 2,
              "Complexity": 3,
              "WeightedComplexity": 0,
              "Hash": null,
              "Binary": false,
              "Minified": false,
              "Generated": false,
              "EndPoint": 0,
              "Uloc": 0
            }
          ],
          "LineLength": null,
          "ULOC": 0
        },
        {
          "Name": "Markdown",
          "Bytes": 100,
          "CodeBytes": 0,
          "Lines": 5,
          "Code": 3,
          "Comment": 0,
          "Blank": 2,
          "Complexity": 0,
          "Count": 1,
          "WeightedComplexity": 0,
          "Files": [
            {
              "Language": "Markdown",
              "PossibleLanguages": ["Markdown"],
              "Filename": "README.md",
              "Extension": "md",
              "Location": "README.md",
              "Symlocation": "",
              "Bytes": 100,
              "Lines": 5,
              "Code": 3,
              "Comment": 0,
              "Blank": 2,
              "Complexity": 0,
              "WeightedComplexity": 0,
              "Hash": null,
              "Binary": false,
              "Minified": false,
              "Generated": false,
              "EndPoint": 0,
              "Uloc": 0
            }
          ],
          "LineLength": null,
          "ULOC": 0
        }
      ]);
      
      // Create mock scc script
      const mockScript = `#!/bin/bash
if [[ "$1" == "--by-file" && "$2" == "-f" && "$3" == "json" ]]; then
  echo '${mockSccOutput}'
else
  echo "Usage: scc --by-file -f json <directory>"
  exit 1
fi`;
      
      writeFileSync(sccPath, mockScript);
      chmodSync(sccPath, 0o755);
      
      // Create a test directory
      const testDir = join(testHome, "test-project");
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, "hello.py"), "# Hello\nprint('Hello')\n");
      writeFileSync(join(testDir, "README.md"), "# Test\n\nThis is a test.\n");
      
      // Run scc and parse output
      const metrics = await service.runScc(testDir);
      
      // Verify the parsed metrics
      expect(metrics).toBeDefined();
      expect(metrics.linesOfCode.net).toBe(11); // 8 + 3
      expect(metrics.complexity.cyclomatic).toBe(3);
      expect(metrics.byLanguage).toHaveLength(2);
      expect(metrics.byFile).toHaveLength(2);
      
      // Check language aggregation
      const pythonLang = metrics.byLanguage.find(l => l.language === "Python");
      expect(pythonLang).toBeDefined();
      expect(pythonLang?.code).toBe(8);
      expect(pythonLang?.complexity).toBe(3);
      
      const markdownLang = metrics.byLanguage.find(l => l.language === "Markdown");
      expect(markdownLang).toBeDefined();
      expect(markdownLang?.code).toBe(3);
      expect(markdownLang?.complexity).toBe(0);
      
      // Check file details
      const helloFile = metrics.byFile.find(f => f.path === "hello.py");
      expect(helloFile).toBeDefined();
      expect(helloFile?.code).toBe(8);
      expect(helloFile?.complexity).toBe(3);
      
      const readmeFile = metrics.byFile.find(f => f.path === "README.md");
      expect(readmeFile).toBeDefined();
      expect(readmeFile?.code).toBe(3);
    });

    it("should handle empty scc output", async () => {
      const { SccService } = await import("../src/impact/scc-service.ts");
      const sccPath = join(testHome, "bin", "scc-empty");
      const service = new SccService(sccPath);
      
      // Create a mock scc binary that returns empty array
      mkdirSync(join(testHome, "bin"), { recursive: true });
      const mockScript = `#!/bin/bash
echo '[]'`;
      
      writeFileSync(sccPath, mockScript);
      chmodSync(sccPath, 0o755);
      
      const testDir = join(testHome, "empty-project");
      mkdirSync(testDir, { recursive: true });
      
      const metrics = await service.runScc(testDir);
      
      expect(metrics.linesOfCode.net).toBe(0);
      expect(metrics.complexity.cyclomatic).toBe(0);
      expect(metrics.byLanguage).toHaveLength(0);
      expect(metrics.byFile).toHaveLength(0);
    });
  });

  describe("ImpactCalculator", () => {
    it("should calculate file changes correctly", async () => {
      const { ImpactCalculator } = await import("../src/impact/calculator.ts");
      const { SccService } = await import("../src/impact/scc-service.ts");
      
      // Create a mock scc service
      const mockSccService = new SccService(join(testHome, "bin", "scc"));
      
      const calculator = new ImpactCalculator(mockSccService);
      
      // Create upstream and workspace directories
      const upstreamDir = join(testHome, "upstream");
      const workspaceDir = join(testHome, "workspace");
      mkdirSync(upstreamDir, { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });

      // Create files in upstream
      writeFileSync(join(upstreamDir, "file1.ts"), "const x = 1;\n");
      writeFileSync(join(upstreamDir, "file2.ts"), "const y = 2;\n");

      // Copy to workspace and modify
      writeFileSync(join(workspaceDir, "file1.ts"), "const x = 1;\n// modified\n");
      writeFileSync(join(workspaceDir, "file2.ts"), "const y = 2;\n");
      writeFileSync(join(workspaceDir, "file3.ts"), "const z = 3;\n"); // New file

      const result = await calculator.calculateImpact("test-session", upstreamDir, workspaceDir);

      expect(result).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.files.changed).toBe(1); // file1.ts modified
      expect(result.metrics.files.new).toBe(1); // file3.ts new
      expect(result.metrics.files.deleted).toBe(0);
    });

    it("should detect deleted files", async () => {
      const { ImpactCalculator } = await import("../src/impact/calculator.ts");
      const { SccService } = await import("../src/impact/scc-service.ts");
      
      const mockSccService = new SccService(join(testHome, "bin", "scc"));
      const calculator = new ImpactCalculator(mockSccService);
      
      const upstreamDir = join(testHome, "upstream");
      const workspaceDir = join(testHome, "workspace");
      mkdirSync(upstreamDir, { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });

      // File exists in upstream but not in workspace
      writeFileSync(join(upstreamDir, "deleted.ts"), "const old = 1;\n");
      writeFileSync(join(workspaceDir, "kept.ts"), "const kept = 2;\n");

      const result = await calculator.calculateImpact("test-session", upstreamDir, workspaceDir);

      expect(result.metrics.files.deleted).toBe(1);
      expect(result.metrics.files.new).toBe(1); // kept.ts is new relative to upstream
    });

    it("should calculate trends between scans", async () => {
      const { ImpactCalculator } = await import("../src/impact/calculator.ts");
      const { SccService } = await import("../src/impact/scc-service.ts");
      
      const mockSccService = new SccService(join(testHome, "bin", "scc"));
      const calculator = new ImpactCalculator(mockSccService);
      const sessionId = "trend-test";

      const upstreamDir = join(testHome, "upstream-trend");
      const workspaceDir = join(testHome, "workspace-trend");
      mkdirSync(upstreamDir, { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });

      // First scan - 2 files
      writeFileSync(join(workspaceDir, "file1.ts"), "const a = 1;\n");
      writeFileSync(join(workspaceDir, "file2.ts"), "const b = 2;\n");
      
      const result1 = await calculator.calculateImpact(sessionId, upstreamDir, workspaceDir);
      expect(result1.metrics.files.new).toBe(2);

      // Second scan - add another file
      writeFileSync(join(workspaceDir, "file3.ts"), "const c = 3;\n");
      
      const result2 = await calculator.calculateImpact(sessionId, upstreamDir, workspaceDir);
      expect(result2.metrics.files.new).toBe(3);
      expect(result2.trends.files.new).toBe("↑"); // Trend should be up
    });

    it("should track unchanged files", async () => {
      const { ImpactCalculator } = await import("../src/impact/calculator.ts");
      const { SccService } = await import("../src/impact/scc-service.ts");
      
      const mockSccService = new SccService(join(testHome, "bin", "scc"));
      const calculator = new ImpactCalculator(mockSccService);
      
      const upstreamDir = join(testHome, "upstream");
      const workspaceDir = join(testHome, "workspace");
      mkdirSync(upstreamDir, { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });

      // Same file in both
      writeFileSync(join(upstreamDir, "unchanged.ts"), "const x = 1;\n");
      writeFileSync(join(workspaceDir, "unchanged.ts"), "const x = 1;\n");

      const result = await calculator.calculateImpact("test-session", upstreamDir, workspaceDir);

      expect(result.metrics.files.unchanged).toBe(1);
      expect(result.metrics.files.new).toBe(0);
      expect(result.metrics.files.changed).toBe(0);
    });
  });

  describe("ImpactRepository", () => {
    it("should save and retrieve impact records", async () => {
      const { ImpactRepository } = await import("../src/impact/repository.ts");
      const repository = new ImpactRepository();
      const projectId = "test-project";

      const impactRecord = {
        id: "session1-abc123",
        sessionId: "session1",
        sessionName: "Test Session",
        projectId: projectId,
        commitHash: "abc123def456",
        commitDate: new Date(),
        files: {
          new: 5,
          changed: 3,
          deleted: 1,
        },
        linesOfCode: {
          added: 245,
          removed: 12,
          net: 233,
        },
        complexity: {
          cyclomatic: 18,
          cognitive: 5,
          estimatedMinutes: 120,
        },
        complexityByLanguage: [
          {
            language: "TypeScript",
            files: 8,
            linesAdded: 233,
            linesRemoved: 12,
            complexityDelta: 18,
          },
        ],
        fossilUrl: "http://localhost:8080",
      };

      repository.save(impactRecord);

      const retrieved = repository.findByProject(projectId);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].sessionName).toBe("Test Session");
      expect(retrieved[0].files.new).toBe(5);
    });

    it("should find records by session", async () => {
      const { ImpactRepository } = await import("../src/impact/repository.ts");
      const repository = new ImpactRepository();
      const projectId = "test-project";

      // Save two records for different sessions
      repository.save({
        id: "session1-abc",
        sessionId: "session1",
        sessionName: "Session 1",
        projectId: projectId,
        commitHash: "abc",
        commitDate: new Date(),
        files: { new: 1, changed: 0, deleted: 0 },
        linesOfCode: { added: 10, removed: 0, net: 10 },
        complexity: { cyclomatic: 1, cognitive: 0, estimatedMinutes: 10 },
        complexityByLanguage: [],
        fossilUrl: "",
      });

      repository.save({
        id: "session2-def",
        sessionId: "session2",
        sessionName: "Session 2",
        projectId: projectId,
        commitHash: "def",
        commitDate: new Date(),
        files: { new: 2, changed: 0, deleted: 0 },
        linesOfCode: { added: 20, removed: 0, net: 20 },
        complexity: { cyclomatic: 2, cognitive: 0, estimatedMinutes: 20 },
        complexityByLanguage: [],
        fossilUrl: "",
      });

      const session1Records = repository.findBySession(projectId, "session1");
      expect(session1Records).toHaveLength(1);
      expect(session1Records[0].sessionName).toBe("Session 1");
    });

    it("should sort records by commit date descending", async () => {
      const { ImpactRepository } = await import("../src/impact/repository.ts");
      const repository = new ImpactRepository();
      const projectId = "test-project";

      // Save records with different dates
      const oldDate = new Date("2024-01-01");
      const newDate = new Date("2024-01-15");

      repository.save({
        id: "session-old",
        sessionId: "session1",
        sessionName: "Old Commit",
        projectId: projectId,
        commitHash: "old",
        commitDate: oldDate,
        files: { new: 1, changed: 0, deleted: 0 },
        linesOfCode: { added: 10, removed: 0, net: 10 },
        complexity: { cyclomatic: 1, cognitive: 0, estimatedMinutes: 10 },
        complexityByLanguage: [],
        fossilUrl: "",
      });

      repository.save({
        id: "session-new",
        sessionId: "session2",
        sessionName: "New Commit",
        projectId: projectId,
        commitHash: "new",
        commitDate: newDate,
        files: { new: 2, changed: 0, deleted: 0 },
        linesOfCode: { added: 20, removed: 0, net: 20 },
        complexity: { cyclomatic: 2, cognitive: 0, estimatedMinutes: 20 },
        complexityByLanguage: [],
        fossilUrl: "",
      });

      const records = repository.findByProject(projectId);
      expect(records).toHaveLength(2);
      expect(records[0].sessionName).toBe("New Commit"); // Most recent first
      expect(records[1].sessionName).toBe("Old Commit");
    });

    it("should return empty array for project with no impacts", async () => {
      const { ImpactRepository } = await import("../src/impact/repository.ts");
      const repository = new ImpactRepository();
      const records = repository.findByProject("non-existent-project");
      expect(records).toEqual([]);
    });
  });

  describe("Impact Trend Calculation", () => {
    it("should show upward trend when new files increase", async () => {
      const { ImpactCalculator } = await import("../src/impact/calculator.ts");
      const { SccService } = await import("../src/impact/scc-service.ts");
      
      const mockSccService = new SccService(join(testHome, "bin", "scc"));
      const calculator = new ImpactCalculator(mockSccService);
      const sessionId = "trend-test";

      const upstreamDir = join(testHome, "upstream-trend");
      const workspaceDir = join(testHome, "workspace-trend");
      mkdirSync(upstreamDir, { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });

      // First scan - 2 files
      writeFileSync(join(workspaceDir, "file1.ts"), "const a = 1;\n");
      writeFileSync(join(workspaceDir, "file2.ts"), "const b = 2;\n");
      
      const result1 = await calculator.calculateImpact(sessionId, upstreamDir, workspaceDir);
      expect(result1.metrics.files.new).toBe(2);

      // Second scan - add another file
      writeFileSync(join(workspaceDir, "file3.ts"), "const c = 3;\n");
      
      const result2 = await calculator.calculateImpact(sessionId, upstreamDir, workspaceDir);
      expect(result2.metrics.files.new).toBe(3);
      expect(result2.trends.files.new).toBe("↑"); // Trend up
    });

    it("should show stable trend when metrics unchanged", async () => {
      const { ImpactCalculator } = await import("../src/impact/calculator.ts");
      const { SccService } = await import("../src/impact/scc-service.ts");
      
      const mockSccService = new SccService(join(testHome, "bin", "scc"));
      const calculator = new ImpactCalculator(mockSccService);
      const sessionId = "trend-stable-test";

      const upstreamDir = join(testHome, "upstream-stable");
      const workspaceDir = join(testHome, "workspace-stable");
      mkdirSync(upstreamDir, { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });

      writeFileSync(join(workspaceDir, "file.ts"), "const x = 1;\n");
      
      // First scan
      await calculator.calculateImpact(sessionId, upstreamDir, workspaceDir);
      
      // Second scan - same state
      const result2 = await calculator.calculateImpact(sessionId, upstreamDir, workspaceDir);
      expect(result2.trends.files.new).toBe("→"); // Stable
    });
  });
});
