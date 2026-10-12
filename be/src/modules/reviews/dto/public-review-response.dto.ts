export interface PublicAuthorDto {
  displayName: string;
}

export interface PublicMediaDto {
  type: 'image' | 'video';
  url: string;
}

export interface PublicReviewItemDto {
  id: string;
  propertyId: string;
  rentalUnitId: string | null;
  rating: number;
  comment: string;
  isAnonymous: boolean;
  author: PublicAuthorDto;
  media: PublicMediaDto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertyRatingSummaryDto {
  averageRating: number;
  reviewCount: number;
}

export interface PublicReviewListResponseDto {
  summary: PropertyRatingSummaryDto;
  data: PublicReviewItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
