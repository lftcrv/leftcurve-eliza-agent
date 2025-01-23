import prisma from '../../db'

async function test() {
  const user = await prisma.user.create({
    data: {
      id: "user1",
      wallet: { balance: 100 }
    }
  });
  console.log('Utilisateur créé:', user);

  const found = await prisma.user.findUnique({
    where: { id: "user1" }
  });
  console.log('Utilisateur trouvé:', found);
}

test()
  .catch(console.error)
  .finally(() => prisma.$disconnect());