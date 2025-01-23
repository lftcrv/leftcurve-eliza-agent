import prisma from '../../db'

export async function createUser(id: string) {
    const wallet = {};
  return prisma.user.create({
    data: { id, wallet }
  })
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } })
}