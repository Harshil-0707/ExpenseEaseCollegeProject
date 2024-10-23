"use server";

import prisma from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function DeleteTransaction(id: string) {
  const user = await currentUser();
  if (!user) {
    return redirect("/sign-in");
  }

  const transaction = await prisma.transaction.findUnique({
    where: {
      userId: user.id,
      id,
    },
  });

  if (!transaction) {
    throw new Error("bad request");
  }

  await prisma.$transaction(async (tx) => {
    // Delete the transaction from the db
    await tx.transaction.delete({
      where: {
        id,
        userId: user.id,
      },
    });

    // Update month history
    const updatedMonthHistory = await tx.monthHistory.update({
      where: {
        day_month_year_userId: {
          userId: user.id,
          day: transaction.date.getUTCDate(),
          month: transaction.date.getUTCMonth(),
          year: transaction.date.getUTCFullYear(),
        },
      },
      data: {
        ...(transaction.type === "expense" && {
          expense: {
            decrement: transaction.amount,
          },
        }),
        ...(transaction.type === "income" && {
          income: {
            decrement: transaction.amount,
          },
        }),
      },
    });

    // Check if both expense and income are zero, and delete if true
    if (updatedMonthHistory.expense === 0 && updatedMonthHistory.income === 0) {
      await tx.monthHistory.delete({
        where: {
          day_month_year_userId: {
            userId: user.id,
            day: transaction.date.getUTCDate(),
            month: transaction.date.getUTCMonth(),
            year: transaction.date.getUTCFullYear(),
          },
        },
      });
    }

    // Update year history
    const updatedYearHistory = await tx.yearHistory.update({
      where: {
        month_year_userId: {
          userId: user.id,
          month: transaction.date.getUTCMonth(),
          year: transaction.date.getUTCFullYear(),
        },
      },
      data: {
        ...(transaction.type === "expense" && {
          expense: {
            decrement: transaction.amount,
          },
        }),
        ...(transaction.type === "income" && {
          income: {
            decrement: transaction.amount,
          },
        }),
      },
    });

    // Check if both expense and income are zero, and delete if true
    if (updatedYearHistory.expense === 0 && updatedYearHistory.income === 0) {
      await tx.yearHistory.delete({
        where: {
          month_year_userId: {
            userId: user.id,
            month: transaction.date.getUTCMonth(),
            year: transaction.date.getUTCFullYear(),
          },
        },
      });
    }
  });
}
