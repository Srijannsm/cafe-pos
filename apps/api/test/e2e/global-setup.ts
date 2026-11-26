// Runs once before the e2e suite: builds a template database by applying
// every migration with `prisma migrate deploy` -- exactly what production
// deploys do -- so a broken migration fails the test run. Each test file then
// clones the template (fast) into its own throwaway database.
import { execSync } from 'node:child_process';
import pg from 'pg';

export default async function setup() {
  if (process.env.E2E_TEMPLATE_READY === '1') return; // sandbox: template built separately
  const adminUrl = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS cafepos_e2e_template WITH (FORCE)');
  await admin.query('CREATE DATABASE cafepos_e2e_template');
  await admin.end();
  const u = new URL(adminUrl);
  u.pathname = '/cafepos_e2e_template';
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: u.toString() } });
}
