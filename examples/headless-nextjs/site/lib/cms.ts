import { headers } from "next/headers";
import { createRequestClient } from "tenoncms/client";
import type cms from "../../cms/tenon.config";

export async function cmsClient() {
  return createRequestClient<typeof cms>(
    { headers: await headers() },
    { baseUrl: process.env.NEXT_PUBLIC_TENON_CMS_URL! },
  );
}
