
export const customResponse = {
  success: 'SUCCESS',
  empty: 'RECORD NOT FOUND',
  failed: 'FAILED',
  unauthorized: 'UNAUTHORIZED'
}

export class CustomPaginator {
  nextPage: number;
  requestedPageSize: number;
  totalPages: number;
}