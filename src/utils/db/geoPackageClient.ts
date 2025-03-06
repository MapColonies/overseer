import { Logger } from '@map-colonies/js-logger';
import { snakeCase } from 'change-case';
import { context, SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import Database from 'better-sqlite3';
import { getUTCDate } from '@map-colonies/mc-utils';
import { TableDefinition } from '../../common/interfaces';
import { SERVICES, SqlDataType } from '../../common/constants';

@injectable()
export class GeoPackageClient {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.TRACER) private readonly tracer: Tracer) {}

  public createTableFromMetadata(gpkgFilePath: string, metadata: Record<string, unknown>, tableName: string = 'metadata'): boolean {
    return context.with(
      trace.setSpan(context.active(), this.tracer.startSpan(`${GeoPackageClient.name}.${this.createTableFromMetadata.name}`)),
      () => {
        const activeSpan = trace.getActiveSpan();
        try {
          this.logger.info({ msg: 'Opening gpkg file', gpkgFilePath });
          const db = new Database(gpkgFilePath, { readonly: false });
          activeSpan?.addEvent('gpkg.opened', { gpkgFilePath });

          db.exec('BEGIN TRANSACTION');
          activeSpan?.addEvent('transaction.started');

          try {
            const tableData = this.mapMetadataToTableData(metadata);
            activeSpan?.addEvent('metadata.mapped', { columnsCount: tableData.length });

            this.dropTableIfExists(db, tableName);
            this.logger.info({ msg: 'Creating table and inserting metadata', tableName });
            this.createTable(db, tableName, tableData);

            this.insertData(db, tableName, tableData);

            this.logger.info({ msg: 'Table created and metadata inserted', tableName });
            db.exec('COMMIT');
            activeSpan?.addEvent('transaction.committed');

            return true;
          } catch (err) {
            this.logger.error({ msg: 'Rolling back transaction due to error', err });
            db.exec('ROLLBACK');
            throw err;
          } finally {
            db.close();
            this.logger.info({ msg: 'GeoPackage file closed', gpkgFilePath });
            activeSpan?.addEvent('gpkg.closed');
          }
        } catch (err) {
          if (err instanceof Error) {
            activeSpan?.recordException(err);
            activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          }
          this.logger.error({ msg: `Error creating table and inserting metadata`, err });
          throw err;
        } finally {
          activeSpan?.end();
        }
      }
    );
  }

  private createTable(db: Database.Database, tableName: string, tableData: TableDefinition[]): void {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.addEvent('table.creating', { tableName });

    const columnDefinitions = tableData.map((col) => `"${col.name}" ${col.dataType}`).join(', ');

    this.logger.debug({ msg: 'Creating table', tableName, columnDefinitions });
    const createTableSQL = `CREATE TABLE "${tableName}" (${columnDefinitions})`;
    db.exec(createTableSQL);
    activeSpan?.addEvent('table.created', { tableName });

    const gpkgContentsTable = 'gpkg_contents';
    const currentDate = getUTCDate().toISOString();

    this.logger.debug({ msg: `Registering table in ${gpkgContentsTable} (required for GeoPackage compliance)`, tableName });
    const registerTableSQL = `
      INSERT INTO ${gpkgContentsTable} (table_name, data_type, identifier, description, last_change)
      VALUES (?, 'attributes', ?, ?, ?)
    `;

    db.prepare(registerTableSQL).run(tableName, tableName, `Table for ${tableName} data`, currentDate);
    this.logger.debug({ msg: `Table registered in ${gpkgContentsTable}` });

    activeSpan?.addEvent('table.registered', { tableName, gpkgContentsTable });
  }

  private insertData(db: Database.Database, tableName: string, tableData: TableDefinition[]): void {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.addEvent('data.inserting', {
      tableName,
      columnCount: tableData.length,
    });

    const columnNames = tableData.map((col) => col.name);
    const placeholders = tableData.map(() => '?').join(', ');
    const insertSQL = `INSERT INTO "${tableName}" ("${columnNames.join('", "')}") VALUES (${placeholders})`;
    const stmt = db.prepare(insertSQL);
    this.logger.debug({ msg: 'Inserting data into table', tableName, columnNames, insertSQL });

    const values = tableData.map((col) => col.value);
    stmt.run(...values);
    this.logger.debug({ msg: 'Data inserted into table', tableName });

    activeSpan?.addEvent('data.inserted');
  }

  private dropTableIfExists(db: Database.Database, tableName: string): void {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.addEvent('table.checking', { tableName });

    const tableCheckStmt = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name=?
      `);

    this.logger.debug({ msg: `Checking if table '${tableName}' exists`, query: tableCheckStmt.source });
    const result = tableCheckStmt.get(tableName);

    if (result != undefined) {
      activeSpan?.addEvent('table.exists', { tableName });
      this.logger.info({ msg: `Table '${tableName}' already exists. Dropping it before recreation.` });

      const removeFromContentsStmt = db.prepare(`
        DELETE FROM gpkg_contents
        WHERE table_name = ?
      `);

      this.logger.debug({ msg: `Removing table '${tableName}' from gpkg_contents`, query: removeFromContentsStmt.source });

      removeFromContentsStmt.run(tableName);

      const dropTableQuery = `DROP TABLE IF EXISTS "${tableName}"`;
      this.logger.debug({ msg: `Dropping table '${tableName}'`, query: dropTableQuery });
      db.exec(dropTableQuery);

      activeSpan?.addEvent('table.dropped', { tableName });
    }
  }

  private mapMetadataToTableData(metadata: Record<string, unknown>): TableDefinition[] {
    const tableDef = Object.entries(metadata).map(([key, value]) => {
      let dataType: SqlDataType = SqlDataType.TEXT;

      if (typeof value === 'number') {
        dataType = Number.isInteger(value) ? SqlDataType.INTEGER : SqlDataType.REAL;
      }
      const snakeCaseName = snakeCase(key);

      return { name: snakeCaseName, dataType, value };
    });
    this.logger.debug({ msg: 'Mapped metadata to table data', tableDef });
    return tableDef;
  }
}
