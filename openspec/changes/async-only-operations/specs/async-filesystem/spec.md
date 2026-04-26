## ADDED Requirements

### Requirement: Asynchronous file system operations
The FileSystem interface SHALL provide asynchronous methods for all file system operations. Each method SHALL return a Promise that resolves to the operation result or rejects on error.

#### Scenario: Reading a file asynchronously
- **WHEN** `fs.readFile("/path/to/file.txt")` is called
- **THEN** it SHALL return a Promise resolving to the file contents

#### Scenario: Checking file existence asynchronously
- **WHEN** `fs.exists("/path/to/file.txt")` is called
- **THEN** it SHALL return a Promise resolving to a boolean

#### Scenario: Writing a file asynchronously
- **WHEN** `fs.writeFile("/path/to/file.txt", "content")` is called
- **THEN** it SHALL return a Promise that resolves when the write completes

#### Scenario: Creating directories asynchronously
- **WHEN** `fs.mkdir("/path/to/dir", { recursive: true })` is called
- **THEN** it SHALL return a Promise that resolves when the directory is created

#### Scenario: Removing files asynchronously
- **WHEN** `fs.unlink("/path/to/file.txt")` is called
- **THEN** it SHALL return a Promise that resolves when the file is removed

#### Scenario: Copying files asynchronously
- **WHEN** `fs.copyFile("/src", "/dest")` is called
- **THEN** it SHALL return a Promise that resolves when the copy completes

#### Scenario: Listing directory contents asynchronously
- **WHEN** `fs.readdir("/path/to/dir")` is called
- **THEN** it SHALL return a Promise resolving to an array of entries

#### Scenario: Getting file statistics asynchronously
- **WHEN** `fs.stat("/path/to/file.txt")` is called
- **THEN** it SHALL return a Promise resolving to file statistics

#### Scenario: Getting symbolic link statistics asynchronously
- **WHEN** `fs.lstat("/path/to/symlink")` is called
- **THEN** it SHALL return a Promise resolving to link statistics

#### Scenario: Copying directories asynchronously
- **WHEN** `fs.cp("/src", "/dest", { recursive: true })` is called
- **THEN** it SHALL return a Promise that resolves when the recursive copy completes

#### Scenario: Updating file timestamps asynchronously
- **WHEN** `fs.utimes("/path/to/file.txt", new Date(), new Date())` is called
- **THEN** it SHALL return a Promise that resolves when timestamps are updated

#### Scenario: Resolving real path asynchronously
- **WHEN** `fs.realpath("/path/to/symlink")` is called
- **THEN** it SHALL return a Promise resolving to the canonical path

#### Scenario: Creating temporary directories asynchronously
- **WHEN** `fs.mkdtemp("/tmp/prefix-")` is called
- **THEN** it SHALL return a Promise resolving to the created directory path

### Requirement: No synchronous command execution
The CommandRunner interface SHALL NOT expose any synchronous command execution methods. All command execution SHALL be asynchronous.

#### Scenario: Running commands asynchronously
- **WHEN** `command.run(["echo", "hello"])` is called
- **THEN** it SHALL return a Promise resolving to the command result

#### Scenario: Spawning processes asynchronously
- **WHEN** `command.spawn(["long-running-process"])` is called
- **THEN** it SHALL return a SpawnedProcess with streaming I/O

### Requirement: Asynchronous ACP client state access
The AcpClient class SHALL provide asynchronous methods for accessing session state. Synchronous getters SHALL be removed.

#### Scenario: Getting ACP session ID asynchronously
- **WHEN** `client.getAcpSessionId()` is called
- **THEN** it SHALL return a Promise resolving to the session ID string

#### Scenario: Getting model state asynchronously
- **WHEN** `client.getModelState()` is called
- **THEN** it SHALL return a Promise resolving to the model state

#### Scenario: Getting mode state asynchronously
- **WHEN** `client.getModeState()` is called
- **THEN** it SHALL return a Promise resolving to the mode state

#### Scenario: Getting available commands asynchronously
- **WHEN** `client.getAvailableCommands()` is called
- **THEN** it SHALL return a Promise resolving to the command list
