/**
 * Order placed → create membership.dropship_jobs rows (design plan §6 job 4).
 *
 * One job per supplier represented in the order (v1: everything is 'std_xr').
 * The dropship worker (pending distributor API credentials) polls
 * dropship_jobs WHERE status='pending' and places the actual supplier order.
 */
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pgConnection = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  );
  const orderModule = container.resolve(Modules.ORDER);

  const order = await orderModule.retrieveOrder(data.id, {
    relations: ["items"],
  });

  const suppliers = new Set<string>();
  for (const item of order.items ?? []) {
    const meta = (item as any).metadata ?? {};
    suppliers.add(String(meta.supplier ?? "std_xr"));
  }
  if (!suppliers.size) suppliers.add("std_xr");

  for (const supplier of suppliers) {
    await pgConnection.raw(
      `insert into membership.dropship_jobs (order_id, supplier, status)
       select ?, ?, 'pending'
       where not exists (
         select 1 from membership.dropship_jobs where order_id = ? and supplier = ?
       )`,
      [order.id, supplier, order.id, supplier]
    );
  }
  logger.info(
    `dropship_jobs queued for order ${order.display_id ?? order.id} (${[...suppliers].join(",")})`
  );
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
