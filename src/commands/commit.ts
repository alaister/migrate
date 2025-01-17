import {
  parseSettings,
  Settings,
  ParsedSettings,
  getCurrentMigrationPath,
  BLANK_MIGRATION_CONTENT,
} from "../settings";
import { getAllMigrations } from "../migration";
import pgMinify = require("pg-minify");
import * as fsp from "../fsp";
import { calculateHash } from "../hash";
import { _reset } from "./reset";
import { _migrate } from "./migrate";
import { logDbError } from "../instrumentation";

export async function commit(settings: Settings) {
  const parsedSettings = await parseSettings(settings, true);
  return _commit(parsedSettings);
}

export async function _commit(parsedSettings: ParsedSettings) {
  const { migrationsFolder } = parsedSettings;
  const committedMigrationsFolder = `${migrationsFolder}/committed`;
  const allMigrations = await getAllMigrations(parsedSettings);
  const lastMigration = allMigrations[allMigrations.length - 1];
  const newMigrationNumber = lastMigration
    ? parseInt(lastMigration.filename, 10) + 1
    : 1;
  if (Number.isNaN(newMigrationNumber)) {
    throw new Error("Could not determine next migration number");
  }
  const newMigrationFilename =
    String(newMigrationNumber).padStart(6, "0") + ".sql";
  const currentMigrationPath = getCurrentMigrationPath(parsedSettings);
  const body = await fsp.readFile(currentMigrationPath, "utf8");
  const minifiedBody = pgMinify(body);
  if (minifiedBody === "") {
    throw new Error("Current migration is blank.");
  }

  const hash = calculateHash(body, lastMigration && lastMigration.hash);
  const finalBody = `--! Previous: ${
    lastMigration ? lastMigration.hash : "-"
  }\n--! Hash: ${hash}\n\n${body.trim()}\n`;
  await _reset(parsedSettings, true);
  const newMigrationFilepath = `${committedMigrationsFolder}/${newMigrationFilename}`;
  await fsp.writeFile(newMigrationFilepath, finalBody);
  console.log(
    `graphile-migrate: New migration '${newMigrationFilename}' created`
  );
  try {
    await _migrate(parsedSettings, true);
    await _migrate(parsedSettings);
    await fsp.writeFile(currentMigrationPath, BLANK_MIGRATION_CONTENT);
  } catch (e) {
    logDbError(e);
    console.error("ABORTING...");
    await fsp.writeFile(currentMigrationPath, body);
    await fsp.unlink(newMigrationFilepath);
    console.error("ABORTED AND ROLLED BACK");
    process.exitCode = 1;
  }
}
