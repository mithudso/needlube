/**
 * Needlube catalog seed — run with:
 *   npx medusa exec ./src/scripts/seed-catalog.ts
 *
 * Reads /opt/needlube/catalog/products.json (extracted from the STD clone),
 * ensures US region + tax region, creates brand collections, imports all
 * products (public price = listed * PUBLIC_MARKUP placeholder until a real
 * distributor feed provides MAP/MSRP), then creates the "Members" customer
 * group and a member price list at the STD listed (near-wholesale) price.
 */
import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createCollectionsWorkflow,
  createPriceListsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createTaxRegionsWorkflow,
} from "@medusajs/medusa/core-flows";
import * as fs from "fs";

const CATALOG = "/opt/needlube/catalog/products.json";
const PUBLIC_MARKUP = 1.4; // placeholder "public/MSRP-ish" price until real feed
const BATCH = 50;

type Rec = {
  handle: string;
  title: string;
  sku: string;
  brand: string | null;
  price: string | null;
  in_stock: boolean;
  images: string[];
  description_text: string;
  source_url: string;
};

const round95 = (n: number) => Math.max(Math.round(n) - 0.05, 0.95);

export default async function seedCatalog({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const records: Rec[] = JSON.parse(fs.readFileSync(CATALOG, "utf8")).filter(
    (r: Rec) => r.title && r.sku && r.price
  );
  logger.info(`catalog records: ${records.length}`);

  // --- US region + tax region -------------------------------------------
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code"],
  });
  if (!regions.some((r: any) => r.currency_code === "usd")) {
    await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "United States",
            currency_code: "usd",
            countries: ["us"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "us", provider_id: "tp_system" }],
    });
    logger.info("created US region + tax region");
  }

  // --- lookups ------------------------------------------------------------
  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  });
  const channelId = channels[0].id;
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfileId = profiles[0]?.id;

  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["handle"],
  });
  const existingHandles = new Set(existingProducts.map((p: any) => p.handle));

  // --- brand collections ----------------------------------------------------
  const { data: existingCols } = await query.graph({
    entity: "product_collection",
    fields: ["id", "title", "handle"],
  });
  const colByTitle = new Map<string, string>(
    existingCols.map((c: any) => [c.title, c.id])
  );
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // brands can differ only by case ("STRICT" vs "Strict") — merge by slug
  const brandTitles = [...new Set(records.map((r) => r.brand).filter(Boolean))] as string[];
  const bySlug = new Map<string, string>(); // slug -> canonical title
  for (const b of brandTitles) if (!bySlug.has(slug(b))) bySlug.set(slug(b), b);

  const colBySlug = new Map<string, string>(); // slug -> collection id
  for (const c of existingCols as any[]) colBySlug.set(c.handle ?? slug(c.title), c.id);
  const newSlugs = [...bySlug.keys()].filter((s) => !colBySlug.has(s));
  if (newSlugs.length) {
    const { result } = await createCollectionsWorkflow(container).run({
      input: {
        collections: newSlugs.map((s) => ({ title: bySlug.get(s)!, handle: s })),
      },
    });
    for (const c of result as any[]) colBySlug.set(c.handle, c.id);
    logger.info(`created ${newSlugs.length} brand collections`);
  }
  for (const b of brandTitles) colByTitle.set(b, colBySlug.get(slug(b))!);

  // --- products -------------------------------------------------------------
  const toCreate = records.filter((r) => !existingHandles.has(r.handle));
  logger.info(`importing ${toCreate.length} products (batch ${BATCH})`);
  const variantPriceBySku = new Map<string, number>();

  for (let i = 0; i < toCreate.length; i += BATCH) {
    const slice = toCreate.slice(i, i + BATCH);
    await createProductsWorkflow(container).run({
      input: {
        products: slice.map((r) => {
          const listed = parseFloat(r.price!);
          const publicPrice = round95(listed * PUBLIC_MARKUP);
          variantPriceBySku.set(r.sku, listed);
          return {
            title: r.title,
            handle: r.handle,
            description: r.description_text?.slice(0, 60000) || undefined,
            status: ProductStatus.PUBLISHED,
            collection_id: r.brand ? colByTitle.get(r.brand) : undefined,
            shipping_profile_id: shippingProfileId,
            images: (r.images || []).slice(0, 4).map((url) => ({ url })),
            metadata: {
              supplier: "std_xr",
              supplier_sku: r.sku,
              listed_price: listed,
              source_url: r.source_url,
            },
            options: [{ title: "Default", values: ["Default"] }],
            variants: [
              {
                title: "Default",
                sku: r.sku,
                options: { Default: "Default" },
                manage_inventory: false,
                prices: [{ amount: publicPrice, currency_code: "usd" }],
              },
            ],
            sales_channels: [{ id: channelId }],
          };
        }),
      },
    });
    logger.info(`  products ${Math.min(i + BATCH, toCreate.length)}/${toCreate.length}`);
  }

  // --- Members group + member price list -------------------------------------
  const customerModule = container.resolve(Modules.CUSTOMER);
  let [group] = await customerModule.listCustomerGroups({ name: "Members" });
  if (!group) {
    group = await customerModule.createCustomerGroups({ name: "Members" });
    logger.info("created customer group: Members");
  }

  const { data: priceLists } = await query.graph({
    entity: "price_list",
    fields: ["id", "title"],
  });
  if (!priceLists.some((p: any) => p.title === "Member pricing")) {
    const { data: variants } = await query.graph({
      entity: "variant",
      fields: ["id", "sku"],
    });
    const prices = variants
      .filter((v: any) => variantPriceBySku.has(v.sku))
      .map((v: any) => ({
        variant_id: v.id,
        currency_code: "usd",
        amount: variantPriceBySku.get(v.sku)!,
      }));
    await createPriceListsWorkflow(container).run({
      input: {
        price_lists_data: [
          {
            title: "Member pricing",
            description:
              "Near-cost member prices (placeholder: STD listed price until real feed cost)",

            status: "active",
            rules: { "customer.groups.id": [group.id] },
            prices,
          },
        ],
      },
    });
    logger.info(`created Member pricing price list with ${prices.length} prices`);
  }

  logger.info("seed-catalog done");
}
