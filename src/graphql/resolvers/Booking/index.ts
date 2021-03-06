import { IResolvers } from 'apollo-server-express';
import { Request } from 'express';
import { ObjectId } from 'mongodb';

import { Listing, Database, Booking, BookingsIndex } from '../../../lib/types';

import { CreateBookingsArgs } from './types';
import { authorize } from '../../../lib/utils';
import { Stripe } from '../../../lib/api';

const resolveBookingsIndex = (
  bookingsIndex: BookingsIndex,
  checkInDate: string,
  checkOutDate: string
): BookingsIndex => {
  let checkIn = new Date(checkInDate);
  let checkOut = new Date(checkOutDate);
  const newBookingsIndex: BookingsIndex = { ...bookingsIndex };

  while (checkIn <= checkOut) {
    const year = checkIn.getUTCFullYear(); // year
    const month = checkIn.getUTCMonth(); // month
    const day = checkIn.getUTCDate(); // day
    if (!newBookingsIndex[year]) {
      newBookingsIndex[year] = {};
    }

    if (!newBookingsIndex[year][month]) {
      newBookingsIndex[year][month] = {};
    }

    if (!newBookingsIndex[year][month][day]) {
      newBookingsIndex[year][month][day] = true;
    } else {
      throw new Error("selected dates can't overlap dates that have already been booked");
    }

    checkIn = new Date(checkIn.getTime() + 86400000);
  }

  return newBookingsIndex;
};

export const bookingResolvers: IResolvers = {
  Mutation: {
    createBooking: async (
      _root: undefined,
      { input }: CreateBookingsArgs,
      { db, req }: { db: Database; req: Request }
    ) => {
      try {
        const { id, source, checkIn, checkOut } = input;

        let viewer = await authorize(db, req);
        if (!viewer) {
          throw new Error('viewer cannot be found');
        }
        const listing = await db.listings.findOne({
          _id: new ObjectId(id)
        });
        if (!listing) {
          throw new Error("listing can't be found");
        }
        if (listing.host === viewer._id) {
          throw new Error("viewer can't book own listing");
        }
        const today = new Date();
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        const millisecondsPerDay = 86400000;

        if (checkInDate.getTime() > today.getTime() + 90 * millisecondsPerDay) {
          throw new Error("check in date can't be more than 90 days from today");
        }

        if (checkOutDate.getTime() > today.getTime() + 90 * millisecondsPerDay) {
          throw new Error("check out date can't be more than 90 days from today");
        }

        if (checkOutDate < checkInDate) {
          throw new Error("check out date can't be before check in date");
        }
        const bookingsIndex = resolveBookingsIndex(listing.bookingsIndex, checkIn, checkOut);

        const totalPrice = listing.price * ((checkOutDate.getTime() - checkInDate.getTime()) / 86400000 + 1);

        const host = await db.users.findOne({
          _id: listing.host
        });

        if (!host || !host.walletId) {
          throw new Error("the host either can't be found or is not connected with Stripe");
        }
        await Stripe.charge(totalPrice, source, host.walletId);

        const insertRes = await db.bookings.insertOne({
          _id: new ObjectId(),
          listing: listing._id,
          tenant: viewer._id,
          checkIn,
          checkOut
        });
    
        const insertedBooking: Booking = insertRes.ops[0];
        await db.users.updateOne({ _id: host._id }, { $inc: { income: totalPrice } });
        await db.users.updateOne(
          { _id: viewer._id },
          { $push: { bookings: insertedBooking._id } }
        );
        await db.listings.updateOne(
          { _id: listing._id },
          {
            $set: { bookingsIndex },
            $push: { bookings: insertedBooking._id }
          }
        );
        return insertedBooking;
      } catch (error) {
        throw new Error(`Failed to create a booking: ${error}`);
      }
    }
  },
  Booking: {
    id: (booking: Booking) => booking._id.toString(),
    listing: (booking: Booking, _args: {}, { db }: { db: Database }): Promise<Listing | null> => {
      return db.listings.findOne({ _id: booking.listing });
    },
    tenant: (booking: Booking, _args: {}, { db }: { db: Database }) => {
      return db.users.findOne({ _id: booking.tenant });
    }
  }
};

