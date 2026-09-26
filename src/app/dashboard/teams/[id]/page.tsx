"use client";

import { EntityDetail } from "../EntityDetail";

export default function TeamDetailPage({ params }: { params: { id: string } }) {
  return <EntityDetail kind="team" id={params.id} />;
}
