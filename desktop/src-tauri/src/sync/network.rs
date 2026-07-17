use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::watch;

/// Network connectivity monitor.
///
/// NOTE: In the desktop app, network state is determined by the app shell
/// (Tauri provides `onLine` events). This monitor provides a programmatic
/// interface that can be driven by the app or set manually.
///
/// For mock/testing mode, use `always_online()` or `testable()`.
pub struct NetworkMonitor;

impl NetworkMonitor {
    /// Create an always-online monitor (for development/testing).
    /// This is the default for the desktop app until real network
    /// detection is wired up via Tauri IPC.
    pub fn always_online() -> (Arc<AtomicBool>, watch::Receiver<bool>) {
        let online = Arc::new(AtomicBool::new(true));
        let (_tx, rx) = watch::channel(true);
        (online, rx)
    }

    /// Create a testable monitor where the online state can be toggled
    /// programmatically via the returned `Arc<AtomicBool>`.
    pub fn testable() -> (Arc<AtomicBool>, watch::Receiver<bool>) {
        let online = Arc::new(AtomicBool::new(true));
        let (tx, rx) = watch::channel(true);

        // Keep the sender alive so the receiver stays open.
        // Periodically broadcast the current state.
        let online_clone = online.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let _ = tx.send(online_clone.load(Ordering::Acquire));
            }
        });

        (online, rx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    #[tokio::test]
    async fn test_always_online() {
        let (online, _rx) = NetworkMonitor::always_online();
        assert!(online.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn test_testable_toggle() {
        let (online, mut rx) = NetworkMonitor::testable();
        assert!(online.load(Ordering::Acquire));

        // Toggle offline
        online.store(false, Ordering::Release);
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        let val = *rx.borrow();
        assert!(!val);

        // Toggle back
        online.store(true, Ordering::Release);
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        let val = *rx.borrow();
        assert!(val);
    }
}
