import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CategoryService } from 'src/category/category.service'
import { LabelProductService } from 'src/label-product/label-product.service'
import { PaginationService } from 'src/pagination/pagination.service'
import { PrismaService } from 'src/prisma.service'
import { returnReviewObject } from 'src/review/return-review.object'
import { convertToNumber } from 'src/utils/convert-to-number'
import { generateSlug } from 'src/utils/generate-slug'
import { EnumProductSort, GetAllProductDto } from './dto/get-all-product.dto'
import { UpdateProductDto } from './dto/product.dto'
import {
	returnFullestProductObject,
	returnProductObject
} from './return-product.object'

@Injectable()
export class ProductService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly categoryService: CategoryService,
		private readonly labelProductService: LabelProductService,
		private paginationService: PaginationService
	) {}

	async getAll(dto: GetAllProductDto = {}) {
		const { perPage, skip } = this.paginationService.getPagination(dto)

		const filters = this.createFilter(dto)

		const products = await this.prisma.product.findMany({
			where: filters,
			orderBy: this.getSortOption(dto.sort),
			skip,
			take: perPage,
			select: returnProductObject
		})

		return {
			products,
			length: await this.prisma.product.count({
				where: filters
			})
		}
	}

	private createFilter(dto: GetAllProductDto): Prisma.ProductWhereInput {
		const filters: Prisma.ProductWhereInput[] = []

		if (dto.searchTerm) filters.push(this.getSearchTermFilter(dto.searchTerm))

		if (dto.ratings)
			filters.push(
				this.getRatingFilter(dto.ratings.split('|').map(rating => +rating))
			)

		if (dto.minPrice || dto.maxPrice)
			filters.push(
				this.getPriceFilter(
					convertToNumber(dto.minPrice),
					convertToNumber(dto.maxPrice)
				)
			)

		if (dto.categoriesIds)
			filters.push(this.getCategoryFilter(dto.categoriesIds))

		return filters.length ? { AND: filters } : {}
	}

	private getSortOption(
		sort: EnumProductSort
	): Prisma.ProductOrderByWithRelationInput[] {
		switch (sort) {
			case EnumProductSort.LOW_PRICE:
				return [{ price: 'asc' }]
			case EnumProductSort.HIGH_PRICE:
				return [{ price: 'desc' }]
			case EnumProductSort.OLDEST:
				return [{ createdAt: 'asc' }]
			default:
				return [{ createdAt: 'desc' }, { inStock: 'asc' }]
		}
	}

	private getSearchTermFilter(searchTerm: string): Prisma.ProductWhereInput {
		return {
			OR: [
				{
					categories: {
						some: {
							name: {
								contains: searchTerm,
								mode: 'insensitive'
							}
						}
					}
				},
				{
					name: {
						contains: searchTerm,
						mode: 'insensitive'
					}
				},
				{
					description: {
						contains: searchTerm,
						mode: 'insensitive'
					}
				},
				{
					composition: {
						contains: searchTerm,
						mode: 'insensitive'
					}
				},
				{
					labelProduct: {
						name: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					}
				}
			]
		}
	}

	private getRatingFilter(ratings: number[]): Prisma.ProductWhereInput {
		return {
			reviews: {
				some: {
					rating: {
						in: ratings
					}
				}
			}
		}
	}

	private getPriceFilter(
		minPrice?: number,
		maxPrice?: number
	): Prisma.ProductWhereInput {
		let priceFilter: Prisma.IntFilter | undefined = undefined

		if (minPrice) {
			priceFilter = {
				...priceFilter,
				gte: minPrice
			}
		}

		if (maxPrice) {
			priceFilter = {
				...priceFilter,
				lte: maxPrice
			}
		}

		return {
			price: priceFilter
		}
	}

	private getCategoryFilter(categoryIds: string[]): Prisma.ProductWhereInput {
		return {
			categories: {
				some: {
					id: {
						in: categoryIds
					}
				}
			}
		}
	}

	byId(id: string) {
		return this.prisma.product.findUnique({
			where: {
				id
			},
			select: returnFullestProductObject
		})
	}

	updateCountOpened(slug: string) {
		return this.prisma.product.update({
			where: { slug },
			data: {
				countOpened: {
					increment: 1
				}
			}
		})
	}

	async bySlug(slug: string) {
		await this.updateCountOpened(slug)
		return this.prisma.product.findUnique({
			where: { slug },
			select: {
				...returnProductObject,
				reviews: {
					select: {
						...returnReviewObject,
						user: {
							select: {
								name: true
							}
						}
					},
					where: { isPublic: true },
					orderBy: {
						createdAt: 'desc'
					}
				}
			}
		})
	}

	async byCategory(categorySlug: string) {
		return await this.prisma.product.findMany({
			where: {
				categories: {
					some: {
						slug: categorySlug
					}
				}
			},
			select: returnProductObject
		})
	}

	async getSimilar(id: string) {
		const currentProduct = await this.byId(id)

		if (!currentProduct)
			throw new NotFoundException('Текущий продукт не найден')

		const products = await this.prisma.product.findMany({
			where: {
				categories: {
					some: {
						name: {
							in: currentProduct.categories.map(category => category.name)
						}
					}
				},
				NOT: {
					id: currentProduct.id
				}
			},
			orderBy: {
				createdAt: 'desc'
			},
			select: returnProductObject
		})

		return products
	}

	async create(userId: string) {
		return await this.prisma.product.create({
			data: {
				name: '',
				slug: '',
				description: '',
				price: 0,
				rating: 0.0,
				discount: 0,
				countOpened: 0,
				countReviews: 0,
				ordersCount: 0,
				inStock: true,
				newPrice: 0,
				categories: {
					connect: []
				},
				userId
			}
		})
	}

	async updateProductRating(productId: string, newRating: number) {
		await this.prisma.product.update({
			where: {
				id: productId
			},
			data: {
				rating: newRating
			}
		})
	}

	async update(id: string, dto: UpdateProductDto) {
		let labelProductConnect = {}
		if (dto.labelProductId) {
			const labelProduct = await this.labelProductService.getById(
				dto.labelProductId
			)
			if (!labelProduct)
				throw new NotFoundException('Метка для товара не найдена')
			labelProductConnect = { connect: { id: dto.labelProductId } }
		}

		return this.prisma.product.update({
			where: {
				id
			},
			data: {
				name: dto.name,
				slug: generateSlug(dto.name),
				description: dto.description,
				price: dto.price,
				composition: dto.composition,
				rating: dto.rating,
				weight: dto.weight,
				images: dto.images,
				newPrice: dto.newPrice,
				discount: dto.discount,
				isPublic: dto.isPublic,
				inStock: dto.inStock,
				categories: {
					set: dto.categories.map(categoryId => ({ id: categoryId })),
					disconnect: dto.categories
						?.filter(categoryId => !dto.categories.includes(categoryId))
						.map(categoryId => ({ id: categoryId }))
				},
				labelProduct: labelProductConnect
			}
		})
	}

	async delete(id: string) {
		const product = await this.byId(id)

		if (!product) throw new NotFoundException('Товар не найден')

		await Promise.all(
			product.reviews.map(review =>
				this.prisma.review.delete({ where: { id: review.id } })
			)
		)

		return this.prisma.product.delete({
			where: { id }
		})
	}
}
