/**
 * Catalog upgrade from the full scrape (catalog.json) — run with:
 *   npx medusa exec ./src/scripts/upgrade-catalog.ts
 *
 * Replaces the bootstrap-era placeholders:
 *   - public variant price: was listed*1.4 → real price_msrp
 *   - images: were hotlinks to sextoydistributing.com (1 per product) →
 *     full local gallery served by Caddy at /catalog-images/*
 *   - adds 302 product categories + links products via category_codes
 *   - metadata: upc, msrp, wholesale, manufacturer
 *
 * Member price list (= wholesale) already correct; untouched.
 */
import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createProductCategoriesWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import * as fs from "fs";

const CATALOG = "/opt/needlube/catalog/catalog.json";
const IMG_BASE = "http://192.168.4.75/catalog-images";
const BATCH = 50;

type Img = {
  url: string;
  role: string;
  local_path?: string;
  large_variant?: { url: string; local_path?: string };
};
type Rec = {
  sku: string;
  page: string;
  name: string;
  price_wholesale?: number;
  price_msrp?: number;
  upc?: string | number;
  brand?: string;
  manufacturer?: string;
  category_codes?: string[];
  images?: Img[];
};

const localUrl = (img: Img): string | null => {
  const lp = img.large_variant?.local_path ?? img.local_path;
  if (!lp) return null;
  // local_path is like "images/Merchant2/graphics/..."; strip the "images/" root
  const rel = lp.replace(/^images\//, "");
  return `${IMG_BASE}/${rel.split("/").map(encodeURIComponent).join("/")}`;
};

export default async function upgradeCatalog({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const cat = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const records: Rec[] = cat.products;
  const bySku = new Map(records.map((r) => [r.sku, r]));
  logger.info(`catalog.json products: ${records.length}, categories: ${cat.categories.length}`);

  // --- categories ------------------------------------------------------------
  const { data: existingCats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  });
  const catByHandle = new Map<string, string>(
    existingCats.map((c: any) => [c.handle, c.id])
  );
  const newCats = cat.categories.filter((c: any) => !catByHandle.has(c.code));
  if (newCats.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: newCats.map((c: any) => ({
          name: c.name || c.title || c.code,
          handle: c.code,
          is_active: true,
        })),
      },
    });
    for (const c of result as any[]) catByHandle.set(c.handle, c.id);
    logger.info(`created ${newCats.length} categories`);
  }

  // --- products ----------------------------------------------------------------
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata", "variants.id", "variants.sku"],
  });

  const updatable = products.filter((p: any) =>
    bySku.has(p.variants?.[0]?.sku)
  );
  logger.info(`matching products to update: ${updatable.length}`);

  let done = 0;
  for (let i = 0; i < updatable.length; i += BATCH) {
    const slice = updatable.slice(i, i + BATCH);
    await updateProductsWorkflow(container).run({
      input: {
        products: slice.map((p: any) => {
          const r = bySku.get(p.variants[0].sku)!;
          const imgs = (r.images ?? [])
            .map(localUrl)
            .filter((u): u is string => !!u)
            .slice(0, 12)
            .map((url) => ({ url }));
          const msrp = r.price_msrp && r.price_msrp > 0 ? r.price_msrp : undefined;
          const catIds = (r.category_codes ?? [])
            .map((c) => catByHandle.get(c))
            .filter((x): x is string => !!x);
          return {
            id: p.id,
            ...(imgs.length ? { images: imgs } : {}),
            ...(catIds.length ? { category_ids: catIds } : {}),
            metadata: {
              ...(p.metadata ?? {}),
              upc: r.upc ? String(r.upc) : undefined,
              msrp: r.price_msrp,
              wholesale: r.price_wholesale,
              manufacturer: r.manufacturer,
            },
            variants: [
              {
                id: p.variants[0].id,
                ...(msrp
                  ? { prices: [{ amount: msrp, currency_code: "usd" }] }
                  : {}),
              },
            ],
          };
        }),
      },
    });
    done = Math.min(i + BATCH, updatable.length);
    if (done % 500 < BATCH) logger.info(`  updated ${done}/${updatable.length}`);
  }
  logger.info(`upgrade-catalog done: ${done} products updated`);
}
