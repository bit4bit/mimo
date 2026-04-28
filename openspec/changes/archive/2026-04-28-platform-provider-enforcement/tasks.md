## 1. Platform - Agent Model Updates

- [x] 1.1 Add `provider` field to Agent interface in repository.ts ("opencode" | "claude")
- [x] 1.2 Update CreateAgentInput to require provider field
- [x] 1.3 Update agent.yaml serialization to include provider field
- [x] 1.4 Create database migration or update existing agents to have default provider="opencode"

## 2. Platform - Agent Creation Flow

- [x] 2.1 Update agent service createAgent() to validate provider is provided
- [x] 2.2 Update agent service generateAgentToken() to include provider in JWT payload
- [x] 2.3 Update CreateAgentInput interface to include provider field

## 3. Platform - UI/API Changes

- [x] 3.1 Update agent creation form to include provider selection dropdown
- [x] 3.2 Update agent routes to pass provider to service layer
- [x] 3.3 Display provider in agent list/detail views

## 4. Agent - Startup Validation

- [x] 4.1 Make `--provider` flag required in parseArgs() (remove default, throw if missing)
- [x] 4.2 Add JWT payload decoding without verification to extract provider claim
- [x] 4.3 Add provider validation: compare declared provider with token provider
- [x] 4.4 Implement backward compatibility: treat missing provider claim as "opencode"
- [x] 4.5 Add clear error messages for mismatch and missing provider cases

## 5. Agent - Provider Selection

- [x] 5.1 Remove default provider fallback in constructor
- [x] 5.2 Ensure provider is validated before any WebSocket connection attempt

## 6. Tests - Platform

- [x] 6.1 Update agent creation tests to include provider field
- [x] 6.2 Add test: reject agent creation without provider
- [x] 6.3 Add test: verify provider is stored in agent.yaml
- [x] 6.4 Add test: verify provider is included in JWT token

## 7. Tests - Agent

- [x] 7.1 Update existing provider tests to require --provider flag
- [x] 7.2 Add test: exit with code 1 when --provider is missing
- [x] 7.3 Add test: exit with code 1 when provider mismatches token
- [x] 7.4 Add test: success when provider matches token
- [x] 7.5 Add test: backward compatibility with legacy tokens (no provider claim)

## 8. Integration

- [x] 8.1 End-to-end test: create agent with provider, start agent with matching provider
- [x] 8.2 End-to-end test: create agent with provider, start agent with wrong provider fails
