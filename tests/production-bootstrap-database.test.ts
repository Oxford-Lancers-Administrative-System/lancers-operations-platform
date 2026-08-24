// @vitest-environment node
/**
 * Gate-lane entry point for the database half of the founding-bootstrap
 * contract. The source file keeps the pure identity, manifest, secret, and
 * audit-envelope checks in the hot lane; only its configured database seam is
 * enabled here.
 */
process.env.PRODUCTION_BOOTSTRAP_DATABASE_CONTRACT = "1";
await import("./production-bootstrap-contract.test");

export {};
