/**
 * The Colophon bundle contract.
 *
 * Shared by the publisher CLI, the backend, the frontend, and the MCP tools.
 * Changes here are changes to the wire format between all four — treat this
 * package as the place where compatibility is decided.
 */

export * from './chunks';
export * from './config';
export * from './frontmatter';
export * from './ids';
export * from './manifest';
export * from './references';
export * from './storage';
