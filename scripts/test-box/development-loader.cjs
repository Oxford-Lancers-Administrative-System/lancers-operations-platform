/** Runs only under Turbopack's built-in development + node conditions. */
module.exports = function localTestRuntime(source) {
  this.addDependency(__filename);
  if (
    this.getOptions().enabled !== true ||
    process.env.K_SERVICE ||
    process.env.NODE_ENV === "production"
  )
    return source;
  return 'export { testRecipientsUnrestricted, testTransport, testSource, applicationNow, applicationSql, testTransaction } from "../../scripts/test-box/app-hooks.mjs";';
};
