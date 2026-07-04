//! Storage ports (traits) + a Postgres adapter.
//!
//! Domain and pipeline code depend only on these traits. The MVP backs all of
//! them with a single Postgres (pgvector for similarity, tsvector for full-text,
//! edge rows + recursive CTE for the graph). Swapping in Qdrant / Kuzu / NATS
//! later means adding an adapter here — not touching the pipeline.

mod ports;
mod postgres;
pub mod connections;
pub mod crypto;

pub use ports::{
    AgentStore, EventStore, FactStore, GraphStore, OrgStore, PatternHit, PatternStore, ScoredFact,
    SkillStore, Store,
};
pub use postgres::PgStore;
pub use connections::{Connection, ConnectionStatus, NewConnection};
pub use crypto::Cipher;
