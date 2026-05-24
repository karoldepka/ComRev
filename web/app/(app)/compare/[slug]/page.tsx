import { CompareClient } from "./compare-client";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ComparisonPage({ params }: Props) {
  const { slug } = await params;
  return <CompareClient slug={slug} />;
}
