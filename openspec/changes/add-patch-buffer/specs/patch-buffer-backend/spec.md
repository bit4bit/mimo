# Spec: PatchBuffer Backend

## Requirement: Create patch record

The system SHALL accept a create request with `filePath`, `originalContent`, and `replacements[]`, compute `patchedContent` by applying all replacements in reverse line-order, store the record keyed by `sessionId + filePath`, and return the full record.

### Scenario: Create with two non-contiguous replacements
- **GIVEN** session `s1` and file `calc.py` with 50 lines
- **WHEN** `POST /sessions/s1/patch-buffers` with `{filePath: "calc.py", originalContent: "...", replacements: [{replace_start_line: 40, replace_end_line: 42, replacement: "..."}, {replace_start_line: 10, replace_end_line: 10, replacement: "..."}]}`
- **THEN** response status is 201
- **AND** response body contains `patchedContent` with both replacements applied
- **AND** line numbers in `patchedContent` are consistent (no off-by-one from replacement ordering)

### Scenario: Create overwrites existing pending patch for same file
- **GIVEN** a pending patch already exists for `s1 + calc.py`
- **WHEN** `POST /sessions/s1/patch-buffers` with a new set of replacements for `calc.py`
- **THEN** the old record is replaced with the new one
- **AND** response status is 201

### Scenario: Reject empty replacements array
- **WHEN** `POST /sessions/s1/patch-buffers` with `replacements: []`
- **THEN** response status is 400

---

## Requirement: Retrieve patch record

The system SHALL return the stored patch record for a `sessionId + filePath` key.

### Scenario: Existing patch
- **GIVEN** a pending patch for `s1 + calc.py`
- **WHEN** `GET /sessions/s1/patch-buffers/calc.py`
- **THEN** response status is 200
- **AND** body contains `originalContent`, `patchedContent`, and `replacements[]`

### Scenario: No patch exists
- **WHEN** `GET /sessions/s1/patch-buffers/nonexistent.py`
- **THEN** response status is 404

---

## Requirement: Approve patch

The system SHALL write `patchedContent` to disk and delete the record when approved.

### Scenario: Approve existing patch
- **GIVEN** a pending patch for `s1 + calc.py`
- **WHEN** `POST /sessions/s1/patch-buffers/calc.py/approve`
- **THEN** response status is 200
- **AND** the file on disk contains `patchedContent`
- **AND** the patch record no longer exists (`GET` returns 404)

### Scenario: Approve nonexistent patch
- **WHEN** `POST /sessions/s1/patch-buffers/nonexistent.py/approve`
- **THEN** response status is 404

---

## Requirement: Decline patch

The system SHALL delete the record without modifying the file when declined.

### Scenario: Decline existing patch
- **GIVEN** a pending patch for `s1 + calc.py`
- **WHEN** `DELETE /sessions/s1/patch-buffers/calc.py`
- **THEN** response status is 200
- **AND** the file on disk is unchanged
- **AND** the patch record no longer exists

---

## Requirement: Session eviction

The system SHALL delete all patch records for a session when that session is destroyed.

### Scenario: Session deleted with two pending patches
- **GIVEN** session `s1` has pending patches for `calc.py` and `utils.py`
- **WHEN** session `s1` is deleted
- **THEN** both patch records are evicted from memory
- **AND** `GET` for either file returns 404
