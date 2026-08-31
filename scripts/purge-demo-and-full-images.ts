/**
 * Post-launch cleanup — run on the NUC with:
 *   cd /opt/needlube/store/apps/backend && npx medusa exec ./src/scripts/purge-demo-and-full-images.ts
 *
 * 1. Soft-deletes the four Medusa starter demo products + their four demo categories.
 * 2. Rewrites every catalog product's image set from catalog.json with NO per-product cap
 *    (upgrade-catalog.ts capped galleries at 12; the largest galleries have 14).
 *    Uses the large (~1000px) rendition when present, else the original — same rule as
 *    upgrade-catalog.ts — and the live public image base.
 * Idempotent: safe to re-run.
 */
import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  deleteProductCategoriesWorkflow,
  deleteProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import * as fs from "fs";

const CATALOG = "/opt/needlube/catalog/catalog.json";
const IMG_BASE = "https://morelube.com/catalog-images";
const BATCH = 50;
const DEMO_PRODUCT_HANDLES = ["t-shirt", "sweatshirt", "sweatpants", "shorts"];
const DEMO_CATEGORY_HANDLES = ["shirts", "sweatshirts", "pants", "merch"];

type Img = { url: string; local_path?: string; large_variant?: { url: string; local_path?: string } };
type Rec = { sku: string; images?: Img[] };

const localUrl = (img: Img): string | null => {
  const lp = img.large_variant?.local_path ?? img.local_path;
  if (!lp) return null;
  const rel = lp.replace(/^images\//, "");
  return `${IMG_BASE}/${rel.split("/").map(encodeURIComponent).join("/")}`;
};

export default async function purgeDemoAndFullImages({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // --- 1. demo products + categories ------------------------------------------
  const { data: demoProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata"],
    filters: { handle: DEMO_PRODUCT_HANDLES },
  });
  const demoIds = demoProducts
    .filter((p: any) => (p.metadata?.supplier ?? "") !== "std_xr") // never touch catalog rows
    .map((p: any) => p.id);
  if (demoIds.length) {
    await deleteProductsWorkflow(container).run({ input: { ids: demoIds } });
    logger.info(`deleted ${demoIds.length} demo products: ${demoProducts.map((p: any) => p.handle).join(", ")}`);
  } else {
    logger.info("no demo products left to delete");
  }

  const { data: demoCats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
    filters: { handle: DEMO_CATEGORY_HANDLES },
  });
  if (demoCats.length) {
    await deleteProductCategoriesWorkflow(container).run({
      input: demoCats.map((c: any) => c.id),
    });
    logger.info(`deleted ${demoCats.length} demo categories: ${demoCats.map((c: any) => c.handle).join(", ")}`);
  } else {
    logger.info("no demo categories left to delete");
  }

  // --- 2. full image galleries ---------------------------------------------------
  const cat = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const bySku = new Map<string, Rec>((cat.products as Rec[]).map((r) => [r.sku, r]));

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "images.id", "variants.sku"],
  });
  const targets = products.filter((p: any) => bySku.has(p.variants?.[0]?.sku));
  logger.info(`catalog products in DB: ${targets.length}`);

  let updated = 0;
  let imageRows = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const payload = slice
      .map((p: any) => {
        const urls = (bySku.get(p.variants[0].sku)!.images ?? [])
          .map(localUrl)
          .filter((u): u is string => !!u);
        // skip products whose image count already matches (cheap idempotence)
        if (!urls.length || urls.length === (p.images?.length ?? 0)) return null;
        imageRows += urls.length;
        return { id: p.id, images: urls.map((url) => ({ url })) };
      })
      .filter((x): x is { id: string; images: { url: string }[] } => !!x);
    if (payload.length) {
      await updateProductsWorkflow(container).run({ input: { products: payload } });
      updated += payload.length;
    }
    if ((i + BATCH) % 500 < BATCH) logger.info(`  scanned ${Math.min(i + BATCH, targets.length)}/${targets.length}, updated ${updated}`);
  }
  logger.info(`done: ${updated} products got full galleries (${imageRows} image rows written)`);
}
