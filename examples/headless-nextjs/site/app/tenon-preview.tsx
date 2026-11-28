"use client";

import { useEffect } from "react";
import { preview } from "tenoncms/preview";

export function TenonPreview() {
  useEffect(() => preview({ admin: `${process.env.NEXT_PUBLIC_TENON_CMS_URL}/admin` }), []);
  return null;
}
