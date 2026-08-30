/**
 * Daily renewal reminder (09:00 server time). No ESP is configured yet, so
 * this records a `renewal_reminder` entitlement event (deduped per grant per
 * window) and logs it; the membership page surfaces expiry to the member.
 * TODO: send email via adult-friendly ESP when one is chosen.
 */
import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export default async function renewalReminder(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);

  const { rows } = await pg.raw(`
    insert into membership.entitlement_events (member_id, event, detail)
    select g.member_id, 'renewal_reminder',
           jsonb_build_object('entitlement', g.entitlement, 'expires_at', g.expires_at,
                              'window', to_char(g.expires_at::date, 'YYYY-MM-DD'))
    from membership.access_grants g
    where g.revoked_at is null
      and g.expires_at is not null
      and g.expires_at between now() and now() + interval '7 days'
      and not exists (
        select 1 from membership.entitlement_events e
        where e.member_id = g.member_id and e.event = 'renewal_reminder'
          and e.detail->>'window' = to_char(g.expires_at::date, 'YYYY-MM-DD')
      )
    returning member_id
  `);
  if (rows.length) {
    logger.info(`renewal-reminder: flagged ${rows.length} member(s) expiring within 7 days`);
  }
}

export const config = {
  name: "renewal-reminder",
  schedule: "0 9 * * *",
};
