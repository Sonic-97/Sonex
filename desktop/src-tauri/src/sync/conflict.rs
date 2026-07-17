use std::time::Duration;
use serde_json::Value;

/// Result of a conflict resolution.
#[derive(Debug, Clone, PartialEq)]
pub enum Resolution {
    /// Accept the local version (discard remote).
    AcceptLocal,
    /// Accept the remote version (overwrite local).
    AcceptRemote,
    /// Mark for manual resolution.
    Manual,
}

/// Conflict resolution strategy.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ConflictStrategy {
    /// Remote always wins (default).
    RemoteWins,
    /// Local always wins (for high-priority local changes).
    LocalWins,
    /// Last-write-wins based on timestamp comparison.
    LastWriteWins,
}

/// Resolves conflicts between local and remote versions of an entity.
pub struct ConflictResolver;

impl ConflictResolver {
    /// Resolve a conflict based on version numbers and strategy.
    ///
    /// `local_version`: the version stored in the local entity row.
    /// `remote_version`: the version from the remote server.
    /// `local_timestamp`: RFC 3339 timestamp of last local update.
    /// `remote_timestamp`: RFC 3339 timestamp of last remote update.
    ///
    /// Returns the resolution action.
    pub fn resolve(
        local_version: i32,
        remote_version: i32,
        local_timestamp: Option<&str>,
        remote_timestamp: Option<&str>,
        strategy: ConflictStrategy,
    ) -> Resolution {
        // No conflict if local is ahead or equal
        if local_version >= remote_version {
            return Resolution::AcceptLocal;
        }

        match strategy {
            ConflictStrategy::RemoteWins => Resolution::AcceptRemote,
            ConflictStrategy::LocalWins => Resolution::AcceptLocal,
            ConflictStrategy::LastWriteWins => {
                Self::last_write_wins(local_timestamp, remote_timestamp)
            }
        }
    }

    /// Determine if a remote change should be applied to local state.
    /// This is called during download to decide whether to overwrite local data.
    pub fn should_apply_remote(
        local_exists: bool,
        local_version: Option<i32>,
        remote_version: i64,
        local_deleted: bool,
        remote_deleted: bool,
        strategy: ConflictStrategy,
    ) -> Resolution {
        if !local_exists {
            // Entity doesn't exist locally — always accept remote (create)
            return Resolution::AcceptRemote;
        }

        let local_ver = local_version.unwrap_or(0) as i64;

        if remote_version <= local_ver {
            // Local is already up to date
            return Resolution::AcceptLocal;
        }

        if local_deleted && !remote_deleted {
            // Local deleted but remote has updates — depends on strategy
            return match strategy {
                ConflictStrategy::LocalWins => Resolution::AcceptLocal,
                _ => Resolution::AcceptRemote, // restore from remote
            };
        }

        if remote_deleted && !local_deleted {
            // Remote deleted but local has data
            return match strategy {
                ConflictStrategy::RemoteWins => Resolution::AcceptRemote,
                _ => Resolution::AcceptLocal, // keep local
            };
        }

        // Both exist, remote is newer
        match strategy {
            ConflictStrategy::LocalWins => Resolution::AcceptLocal,
            _ => Resolution::AcceptRemote,
        }
    }

    fn last_write_wins(
        local_timestamp: Option<&str>,
        remote_timestamp: Option<&str>,
    ) -> Resolution {
        match (local_timestamp, remote_timestamp) {
            (Some(local), Some(remote)) => {
                if local >= remote {
                    Resolution::AcceptLocal
                } else {
                    Resolution::AcceptRemote
                }
            }
            (Some(_), None) => Resolution::AcceptLocal,
            (None, Some(_)) => Resolution::AcceptRemote,
            (None, None) => Resolution::AcceptLocal, // can't determine, keep local
        }
    }

    /// Calculate exponential backoff delay in milliseconds.
    pub fn retry_delay(retry_count: u32, base_delay_ms: u64, max_delay_ms: u64) -> Duration {
        let delay = base_delay_ms.saturating_mul(2u64.saturating_pow(retry_count));
        let delay = delay.min(max_delay_ms);
        // Add deterministic jitter based on retry count
        let jitter = (retry_count as u64 * 7919) % 1000;
        Duration::from_millis(delay + jitter)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_local_ahead_no_conflict() {
        let r = ConflictResolver::resolve(5, 3, Some("2024-01-01"), Some("2024-01-02"), ConflictStrategy::RemoteWins);
        assert_eq!(r, Resolution::AcceptLocal);
    }

    #[test]
    fn test_remote_wins() {
        let r = ConflictResolver::resolve(2, 5, None, None, ConflictStrategy::RemoteWins);
        assert_eq!(r, Resolution::AcceptRemote);
    }

    #[test]
    fn test_local_wins() {
        let r = ConflictResolver::resolve(2, 5, None, None, ConflictStrategy::LocalWins);
        assert_eq!(r, Resolution::AcceptLocal);
    }

    #[test]
    fn test_last_write_wins_remote() {
        let r = ConflictResolver::resolve(
            1, 2,
            Some("2024-01-01T00:00:00Z"),
            Some("2024-01-02T00:00:00Z"),
            ConflictStrategy::LastWriteWins,
        );
        assert_eq!(r, Resolution::AcceptRemote);
    }

    #[test]
    fn test_last_write_wins_local() {
        let r = ConflictResolver::resolve(
            1, 2,
            Some("2024-01-02T00:00:00Z"),
            Some("2024-01-01T00:00:00Z"),
            ConflictStrategy::LastWriteWins,
        );
        assert_eq!(r, Resolution::AcceptLocal);
    }

    #[test]
    fn test_should_apply_create() {
        let r = ConflictResolver::should_apply_remote(
            false, None, 1, false, false, ConflictStrategy::RemoteWins,
        );
        assert_eq!(r, Resolution::AcceptRemote);
    }

    #[test]
    fn test_should_apply_already_current() {
        let r = ConflictResolver::should_apply_remote(
            true, Some(5), 5, false, false, ConflictStrategy::RemoteWins,
        );
        assert_eq!(r, Resolution::AcceptLocal);
    }

    #[test]
    fn test_retry_delay_increases() {
        let d1 = ConflictResolver::retry_delay(0, 1000, 300000);
        let d2 = ConflictResolver::retry_delay(1, 1000, 300000);
        let d3 = ConflictResolver::retry_delay(2, 1000, 300000);
        let d8 = ConflictResolver::retry_delay(8, 1000, 300000);

        assert!(d2 > d1, "retry 1 should be longer than retry 0");
        assert!(d3 > d2, "retry 2 should be longer than retry 1");
        assert!(d8 <= Duration::from_millis(300000), "should cap at max_delay");
    }
}
