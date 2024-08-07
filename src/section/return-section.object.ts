import { Prisma } from '@prisma/client'

export const returnSectionObject: Prisma.SectionSelect = {
	id: true,
	name: true,
	slug: true,
	createdAt: true,
	categories: {
		select: {
			id: true,
			createdAt: true,
			updatedAt: true,
			name: true,
			slug: true,
			products: {
				select: {
					id: true,
					createdAt: true,
					name: true,
					rating: true,
					slug: true,
					images: true,
					price: true,
					weight: true,
					newPrice: true,
					inStock: true,
					reviews: {
						select: {
							createdAt: true,
							message: true,
							images: true,
							rating: true,
							user: {
								select: {
									name: true
								}
							}
						}
					},
					labelProductId: true,
					labelProduct: {
						select: {
							name: true
						}
					},
					categories: true,
					userId: true
				}
			}
		}
	}
}
