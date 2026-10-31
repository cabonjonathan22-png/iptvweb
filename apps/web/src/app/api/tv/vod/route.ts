import { posterList } from '@/lib/tv-posters';

export const GET = (req: Request) => posterList(req, 'vod');
