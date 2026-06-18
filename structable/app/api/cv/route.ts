import { CV } from '@/data/cv';

export async function GET() {
  return Response.json(CV);
}
