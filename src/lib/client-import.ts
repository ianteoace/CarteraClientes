import { Prisma, WorkspacePermission } from "@prisma/client";

import { getClientScopeFilter, getGroupScopeFilter, hasAllGroups, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";

const MAX_CSV_FILE_SIZE = 1024 * 1024;
const MAX_CSV_ROWS = 1000;

export type ContactImportStatus =
  | "READY"
  | "EXISTING_DUPLICATE"
  | "FILE_DUPLICATE"
  | "INVALID_PHONE"
  | "INVALID_NAME";

export type ContactImportRow = {
  rowNumber: number;
  name: string;
  phone: string;
  phoneNormalized: string | null;
  company: string;
  status: ContactImportStatus;
};

export type ContactImportSummary = {
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
};

export type ContactImportPreview = {
  rows: ContactImportRow[];
  summary: ContactImportSummary;
};

export type ContactImportResult = ContactImportSummary & {
  created: number;
  groupName: string | null;
};

export class ContactImportError extends Error {}

type ParsedContactRow = {
  rowNumber: number;
  name: string;
  phone: string;
  company: string;
};

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (quoted) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) {
    throw new ContactImportError("El CSV contiene comillas sin cerrar.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function readCsvFile(file: File): Promise<ParsedContactRow[]> {
  if (!file.name.toLocaleLowerCase().endsWith(".csv")) {
    throw new ContactImportError("Seleccioná un archivo CSV.");
  }

  if (file.size === 0) {
    throw new ContactImportError("El archivo CSV está vacío.");
  }

  if (file.size > MAX_CSV_FILE_SIZE) {
    throw new ContactImportError("El archivo CSV supera el límite de 1 MB.");
  }

  const rows = parseCsv(await file.text());
  const header = rows.shift();

  if (!header) {
    throw new ContactImportError("El CSV debe incluir encabezados.");
  }

  const headers = header.map(normalizeHeader);
  const nameIndex = headers.findIndex((value) => ["name", "nombre"].includes(value));
  const phoneIndex = headers.findIndex((value) =>
    ["phone", "telefono", "telefono", "celular"].includes(value),
  );
  const companyIndex = headers.findIndex((value) => ["company", "empresa"].includes(value));

  if (nameIndex < 0 || phoneIndex < 0) {
    throw new ContactImportError(
      "El CSV debe incluir las columnas name y phone (o nombre y teléfono).",
    );
  }

  const contacts = rows
    .map((row, index) => ({
      rowNumber: index + 2,
      name: (row[nameIndex] ?? "").trim(),
      phone: (row[phoneIndex] ?? "").trim(),
      company: companyIndex >= 0 ? (row[companyIndex] ?? "").trim() : "",
    }))
    .filter((row) => row.name || row.phone || row.company);

  if (contacts.length > MAX_CSV_ROWS) {
    throw new ContactImportError("El CSV supera el límite de 1.000 contactos por importación.");
  }

  return contacts;
}

async function buildPreview(context: AuthorizationContext, rows: ParsedContactRow[]): Promise<ContactImportPreview> {
  const phoneCandidates = new Set<string>();

  for (const row of rows) {
    try {
      phoneCandidates.add(normalizePhone(row.phone));
    } catch {
      // The row is marked below with its user-facing validation state.
    }
  }

  const existingPhones = new Set(
    (
      await prisma.client.findMany({
        where: { phoneNormalized: { in: [...phoneCandidates] }, ...getClientScopeFilter(context) },
        select: { phoneNormalized: true },
      })
    ).map((client) => client.phoneNormalized),
  );
  const seenPhones = new Set<string>();
  const previewRows: ContactImportRow[] = rows.map((row) => {
    if (!row.name) {
      return { ...row, phoneNormalized: null, status: "INVALID_NAME" };
    }

    let phoneNormalized: string;
    try {
      phoneNormalized = normalizePhone(row.phone);
    } catch {
      return { ...row, phoneNormalized: null, status: "INVALID_PHONE" };
    }

    if (seenPhones.has(phoneNormalized)) {
      return { ...row, phoneNormalized, status: "FILE_DUPLICATE" };
    }

    seenPhones.add(phoneNormalized);

    if (existingPhones.has(phoneNormalized)) {
      return { ...row, phoneNormalized, status: "EXISTING_DUPLICATE" };
    }

    return { ...row, phoneNormalized, status: "READY" };
  });

  return {
    rows: previewRows,
    summary: {
      total: previewRows.length,
      valid: previewRows.filter((row) => row.status === "READY").length,
      duplicates: previewRows.filter(
        (row) => row.status === "EXISTING_DUPLICATE" || row.status === "FILE_DUPLICATE",
      ).length,
      invalid: previewRows.filter(
        (row) => row.status === "INVALID_NAME" || row.status === "INVALID_PHONE",
      ).length,
    },
  };
}

export async function previewContactImport(context: AuthorizationContext, file: File) {
  requirePermission(context, WorkspacePermission.CONTACT_CREATE);
  return buildPreview(context, await readCsvFile(file));
}

export async function importContactsFromCsv(context: AuthorizationContext, file: File, groupId?: string): Promise<ContactImportResult> {
  requirePermission(context, WorkspacePermission.CONTACT_CREATE);
  if (!hasAllGroups(context) && !groupId) {
    throw new ContactImportError("Seleccioná un grupo al que tengas acceso para importar contactos.");
  }
  const preview = await previewContactImport(context, file);
  const readyRows = preview.rows.filter(
    (row): row is ContactImportRow & { phoneNormalized: string } => row.status === "READY",
  );

  try {
    return await prisma.$transaction(
      async (transaction) => {
        let groupName: string | null = null;

        if (groupId) {
          const group = await transaction.group.findFirst({
            where: { id: groupId, ...getGroupScopeFilter(context) },
            select: { id: true, name: true },
          });

          if (!group) {
            throw new ContactImportError("El grupo seleccionado ya no existe.");
          }

          groupName = group.name;
        }

        if (readyRows.length === 0) {
          return { ...preview.summary, created: 0, groupName };
        }

        const currentDuplicates = new Set(
          (
            await transaction.client.findMany({
              where: { workspaceId: context.workspaceId, phoneNormalized: { in: readyRows.map((row) => row.phoneNormalized) } },
              select: { phoneNormalized: true },
            })
          ).map((client) => client.phoneNormalized),
        );
        const rowsToCreate = readyRows.filter(
          (row) => !currentDuplicates.has(row.phoneNormalized),
        );
        const created = await transaction.client.createManyAndReturn({
          data: rowsToCreate.map((row) => ({
            workspaceId: context.workspaceId, name: row.name,
            phone: row.phone,
            phoneNormalized: row.phoneNormalized,
            company: row.company || null,
            optIn: false,
          })),
          select: { id: true },
        });

        if (groupId && created.length > 0) {
          await transaction.clientGroup.createMany({
            data: created.map((client) => ({ clientId: client.id, groupId })),
          });
        }

        if (created.length > 0) {
          await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CONTACT, action: ACTIVITY_ACTION.CONTACTS_IMPORTED, metadata: { count: created.length, assignedToGroup: Boolean(groupId) } }, transaction);
        }

        return {
          total: preview.summary.total,
          valid: rowsToCreate.length,
          duplicates: preview.summary.duplicates + currentDuplicates.size,
          invalid: preview.summary.invalid,
          created: created.length,
          groupName,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ContactImportError(
        "La cartera cambió mientras se importaba. Volvé a generar la vista previa.",
      );
    }

    throw error;
  }
}
