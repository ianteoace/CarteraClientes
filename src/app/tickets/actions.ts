"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationRequiredError } from "@/lib/auth/server";
import { AuthorizationError, getAuthorizationContext } from "@/lib/authorization";
import { CaseValidationError } from "@/lib/case-service";
import {
  TicketValidationError,
  addTicketNote,
  addTicketParticipants,
  assignTicket,
  changeTicketStatus,
  createTicket,
  removeTicketParticipant,
  unassignTicket,
  updateTicket,
  updateTicketResolution,
} from "@/lib/ticket-service";

export type TicketActionResult =
  | { success: true; number?: number; message?: string }
  | { success: false; error: string };

function ticketActionError(error: unknown): TicketActionResult {
  if (
    error instanceof TicketValidationError
    || error instanceof CaseValidationError
    || error instanceof AuthorizationError
    || error instanceof AuthenticationRequiredError
  ) return { success: false, error: error.message };
  return { success: false, error: "No se pudo completar la acción. Intentá nuevamente." };
}

function refreshTicket(number?: number) {
  revalidatePath("/tickets");
  if (number) revalidatePath(`/tickets/${number}`);
  revalidatePath("/clientes");
}

export async function createTicketAction(formData: FormData): Promise<TicketActionResult> {
  try {
    const ticket = await createTicket(await getAuthorizationContext(), {
      contactId: String(formData.get("contactId") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      priority: String(formData.get("priority") ?? "NORMAL"),
      assignedMemberId: String(formData.get("assignedMemberId") ?? ""),
      participantIds: formData.getAll("participantIds").map(String),
    });
    if (!ticket) return { success: false, error: "No se pudo crear el ticket." };
    refreshTicket(ticket.number);
    return { success: true, number: ticket.number };
  } catch (error) {
    return ticketActionError(error);
  }
}

export async function updateTicketAction(id: string, number: number, formData: FormData): Promise<TicketActionResult> {
  try {
    const ticket = await updateTicket(await getAuthorizationContext(), id, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      priority: String(formData.get("priority") ?? "NORMAL"),
    });
    if (!ticket) return { success: false, error: "El ticket no existe o está fuera de tu alcance." };
    refreshTicket(number);
    return { success: true, message: "Ticket actualizado." };
  } catch (error) { return ticketActionError(error); }
}

export async function changeTicketStatusAction(id: string, number: number, status: string, resolution?: string): Promise<TicketActionResult> {
  try {
    const ticket = await changeTicketStatus(await getAuthorizationContext(), id, status, resolution);
    if (!ticket) return { success: false, error: "El ticket no existe o está fuera de tu alcance." };
    refreshTicket(number);
    return { success: true, message: "Estado actualizado." };
  } catch (error) { return ticketActionError(error); }
}

export async function assignTicketAction(id: string, number: number, memberId: string): Promise<TicketActionResult> {
  try {
    const ticket = await assignTicket(await getAuthorizationContext(), id, memberId);
    if (!ticket) return { success: false, error: "El ticket no existe o está fuera de tu alcance." };
    refreshTicket(number);
    return { success: true, message: "Responsable actualizado." };
  } catch (error) { return ticketActionError(error); }
}

export async function unassignTicketAction(id: string, number: number): Promise<TicketActionResult> {
  try {
    const ticket = await unassignTicket(await getAuthorizationContext(), id);
    if (!ticket) return { success: false, error: "El ticket no existe o está fuera de tu alcance." };
    refreshTicket(number);
    return { success: true, message: "El ticket quedó sin responsable." };
  } catch (error) { return ticketActionError(error); }
}

export async function addTicketParticipantsAction(id: string, number: number, memberIds: string[]): Promise<TicketActionResult> {
  try {
    const result = await addTicketParticipants(await getAuthorizationContext(), id, memberIds);
    if (!result) return { success: false, error: "El ticket no existe o está fuera de tu alcance." };
    refreshTicket(number);
    return { success: true, message: `${result.added} participante(s) agregado(s) · ${result.unchanged} ya participaban` };
  } catch (error) { return ticketActionError(error); }
}

export async function removeTicketParticipantAction(id: string, number: number, memberId: string): Promise<TicketActionResult> {
  try {
    const result = await removeTicketParticipant(await getAuthorizationContext(), id, memberId);
    if (!result) return { success: false, error: "El ticket no existe o está fuera de tu alcance." };
    refreshTicket(number);
    return { success: true, message: result.removed ? "Participante quitado." : "El miembro ya no participaba." };
  } catch (error) { return ticketActionError(error); }
}

export async function updateTicketResolutionAction(id: string, number: number, resolution: string): Promise<TicketActionResult> {
  try {
    const ticket = await updateTicketResolution(await getAuthorizationContext(), id, resolution);
    if (!ticket) return { success: false, error: "El ticket no existe o está fuera de tu alcance." };
    refreshTicket(number);
    return { success: true, message: "Resolución actualizada." };
  } catch (error) { return ticketActionError(error); }
}

export async function addTicketNoteAction(id: string, number: number, body: string): Promise<TicketActionResult> {
  try {
    const note = await addTicketNote(await getAuthorizationContext(), id, body);
    if (!note) return { success: false, error: "El ticket no existe o está fuera de tu alcance." };
    refreshTicket(number);
    return { success: true, message: "Nota agregada." };
  } catch (error) { return ticketActionError(error); }
}
