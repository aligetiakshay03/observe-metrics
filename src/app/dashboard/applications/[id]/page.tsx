"use client";

import { EntityDetail } from "../../teams/EntityDetail";

export default function ApplicationDetailPage({ params }: { params: { id: string } }) {
  return <EntityDetail kind="app" id={params.id} />;
}
