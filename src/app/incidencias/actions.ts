"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationRequiredError } from "@/lib/auth/server";
import { AuthorizationError, getAuthorizationContext } from "@/lib/authorization";
import { CaseValidationError } from "@/lib/case-service";
import {
  IncidentValidationError,
  addIncidentNote,
  addIncidentParticipants,
  assignIncident,
  changeIncidentStatus,
  createIncident,
  linkTickets,
  removeIncidentParticipant,
  unassignIncident,
  unlinkTicket,
  updateIncident,
  updateIncidentResolution,
} from "@/lib/incident-service";

export type IncidentActionResult =
  | { success: true; number?: number; message?: string }
  | { success: false; error: string };

function actionError(error: unknown): IncidentActionResult {
  if (error instanceof IncidentValidationError || error instanceof CaseValidationError || error instanceof AuthorizationError || error instanceof AuthenticationRequiredError) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "No se pudo completar la acción. Intentá nuevamente." };
}

function refreshIncident(number?: number) {
  revalidatePath("/incidencias");
  if (number) revalidatePath(`/incidencias/${number}`);
  revalidatePath("/tickets");
}

export async function createIncidentAction(formData: FormData): Promise<IncidentActionResult> {
  try {
    const incident = await createIncident(await getAuthorizationContext(), {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      priority: String(formData.get("priority") ?? "NORMAL"),
      assignedMemberId: String(formData.get("assignedMemberId") ?? ""),
      participantIds: formData.getAll("participantIds").map(String),
    });
    if (!incident) return { success: false, error: "No se pudo crear la incidencia." };
    refreshIncident(incident.number);
    return { success: true, number: incident.number };
  } catch (error) { return actionError(error); }
}

export async function updateIncidentAction(id: string, number: number, formData: FormData): Promise<IncidentActionResult> {
  try {
    const incident = await updateIncident(await getAuthorizationContext(), id, { title: String(formData.get("title") ?? ""), description: String(formData.get("description") ?? ""), priority: String(formData.get("priority") ?? "NORMAL") });
    if (!incident) return { success: false, error: "La incidencia no existe o está fuera de tu alcance." };
    refreshIncident(number);
    return { success: true, message: "Incidencia actualizada." };
  } catch (error) { return actionError(error); }
}

export async function changeIncidentStatusAction(id: string, number: number, status: string, resolution?: string): Promise<IncidentActionResult> {
  try {
    const incident = await changeIncidentStatus(await getAuthorizationContext(), id, status, resolution);
    if (!incident) return { success: false, error: "La incidencia no existe o está fuera de tu alcance." };
    refreshIncident(number);
    return { success: true, message: "Estado actualizado." };
  } catch (error) { return actionError(error); }
}

export async function assignIncidentAction(id: string, number: number, memberId: string): Promise<IncidentActionResult> {
  try {
    const incident = await assignIncident(await getAuthorizationContext(), id, memberId);
    if (!incident) return { success: false, error: "La incidencia no existe o está fuera de tu alcance." };
    refreshIncident(number);
    return { success: true, message: "Responsable actualizado." };
  } catch (error) { return actionError(error); }
}

export async function unassignIncidentAction(id: string, number: number): Promise<IncidentActionResult> {
  try {
    const incident = await unassignIncident(await getAuthorizationContext(), id);
    if (!incident) return { success: false, error: "La incidencia no existe o está fuera de tu alcance." };
    refreshIncident(number);
    return { success: true, message: "La incidencia quedó sin responsable." };
  } catch (error) { return actionError(error); }
}

export async function addIncidentParticipantsAction(id: string, number: number, memberIds: string[]): Promise<IncidentActionResult> {
  try {
    const result = await addIncidentParticipants(await getAuthorizationContext(), id, memberIds);
    if (!result) return { success: false, error: "La incidencia no existe o está fuera de tu alcance." };
    refreshIncident(number);
    return { success: true, message: `${result.added} participante(s) agregado(s) · ${result.unchanged} ya participaban` };
  } catch (error) { return actionError(error); }
}

export async function removeIncidentParticipantAction(id: string, number: number, memberId: string): Promise<IncidentActionResult> {
  try {
    const result = await removeIncidentParticipant(await getAuthorizationContext(), id, memberId);
    if (!result) return { success: false, error: "La incidencia no existe o está fuera de tu alcance." };
    refreshIncident(number);
    return { success: true, message: result.removed ? "Participante quitado." : "El miembro ya no participaba." };
  } catch (error) { return actionError(error); }
}

export async function updateIncidentResolutionAction(id: string, number: number, resolution: string): Promise<IncidentActionResult> {
  try {
    const incident = await updateIncidentResolution(await getAuthorizationContext(), id, resolution);
    if (!incident) return { success: false, error: "La incidencia no existe o está fuera de tu alcance." };
    refreshIncident(number);
    return { success: true, message: "Resolución actualizada." };
  } catch (error) { return actionError(error); }
}

export async function addIncidentNoteAction(id: string, number: number, body: string): Promise<IncidentActionResult> {
  try {
    const note = await addIncidentNote(await getAuthorizationContext(), id, body);
    if (!note) return { success: false, error: "La incidencia no existe o está fuera de tu alcance." };
    refreshIncident(number);
    return { success: true, message: "Nota agregada." };
  } catch (error) { return actionError(error); }
}

export async function linkTicketsAction(id: string, number: number, ticketIds: string[]): Promise<IncidentActionResult> {
  try {
    const result = await linkTickets(await getAuthorizationContext(), id, ticketIds);
    if (!result) return { success: false, error: "La incidencia no existe o está fuera de tu alcance." };
    refreshIncident(number);
    return { success: true, message: `${result.linked} ticket(s) vinculado(s) · ${result.unchanged} ya estaban vinculados` };
  } catch (error) { return actionError(error); }
}

export async function unlinkTicketAction(id: string, number: number, ticketId: string): Promise<IncidentActionResult> {
  try {
    const result = await unlinkTicket(await getAuthorizationContext(), id, ticketId);
    if (!result) return { success: false, error: "La incidencia no existe o está fuera de tu alcance." };
    refreshIncident(number);
    return { success: true, message: result.unlinked ? "Ticket desvinculado." : "El ticket ya no estaba vinculado." };
  } catch (error) { return actionError(error); }
}
