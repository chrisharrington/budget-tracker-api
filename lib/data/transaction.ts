import dayjs from 'dayjs';
import timeZonePlugin from 'dayjs-ext/plugin/timeZone';
import getTimezoneOffset from 'get-timezone-offset';

import { Base } from './base';

import { Transaction } from '@lib/models';


dayjs.extend(timeZonePlugin);

class TransactionService extends Base<Transaction> {
    private offset: number;

    constructor() {
        super('transactions');

        this.offset = getTimezoneOffset('America/Edmonton');
    }

    async get(id: number) : Promise<Transaction[]> {
        return await this.find({ id });
    }

    async getForWeek(date: Date) : Promise<Transaction[]> {
        const start = dayjs(date).add(this.offset, 'minute',).toDate(),
            end = dayjs(date).add(this.offset, 'minute').add(1, 'week').subtract(1, 'second').toDate();
        
        return await this.find({
            date: {
                $gte: start,
                $lte: end
            }
        }, { date: -1 });
    }

    async getBalance(date: Date) : Promise<number | undefined> {
        const transaction = await this.findOne({ date: dayjs(date).add(this.offset, 'minute').toDate(), balance: true });
        return transaction ? transaction.amount : undefined;
    }

    async save(items: Transaction[]) : Promise<void> {
        await Promise.all(items.map((item: Transaction) => (
            this.updateOne(item)
        )));
    }
}

export default new TransactionService();