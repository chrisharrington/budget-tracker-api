import { Application, Request, Response } from 'express';
import dayjs from 'dayjs';
import getTimezoneOffset from 'get-timezone-offset';

import Config from '@lib/config';
import TransactionService from '@lib/data/transaction';
import { Budget, Tag, Transaction } from '@lib/models';

import timeZonePlugin from 'dayjs-ext/plugin/timeZone';

dayjs.extend(timeZonePlugin);

export default class BudgetRoute {
    static initialize(app: Application) {
        app.get('/', this.getCurrentBudget.bind(this));
        app.get('/week', this.getBudgetForWeek.bind(this));
        app.get('/history', this.getHistory.bind(this));
        app.post('/transaction', this.updateTransaction.bind(this));
        app.post('/transaction/split', this.splitTransaction.bind(this));
    }

    private static async getCurrentBudget(_: Request, response: Response) {
        try {
            console.log('Request received: GET /');
            
            const current = await TransactionService.getForWeek(dayjs().toDate()),
                last = await TransactionService.getForWeek(dayjs().subtract(1, 'week').toDate()),
                weeklyAmount = Config.weeklyAmount(new Date());

            response.status(200).send(new Budget({
                weeklyAmount,
                lastWeekRemaining: weeklyAmount - last
                    .filter((transaction: Transaction) => !transaction.ignored)
                    .map((transaction: Transaction) => transaction.amount)
                    .reduce((amount: number, sum: number) => sum + amount, 0),
                transactions: current
            }));
        } catch (e) {
            console.log('Request failed: GET /');
            console.error(e);
            response.status(500).send(e);
        }
    }

    private static async getBudgetForWeek(request: Request, response: Response) {
        try {
            console.log('Request received: GET /week');

            if (!request.query || !request.query.date)
                throw new Error('Missing date parameter in query string.');

            let current = dayjs(request.query.date as string, 'YYYY-MM-DD').startOf('day');
            while (current.day() !== 1)
                current = current.subtract(1, 'day');

            const date = current.toDate(),
                currentTransactions = await TransactionService.getForWeek(date),
                weeklyAmount = Config.weeklyAmount(date);

            let balance = await this.getBalanceFromPreviousWeek(current, currentTransactions);
            
            response.status(200).send(new Budget({
                date,
                weeklyAmount: weeklyAmount + balance,
                transactions: currentTransactions
            }));
        } catch (e) {
            console.log('Request failed: GET /week');
            console.error(e);
            response.status(500).send(e);
        }
    }

    private static async getHistory(_: Request, response: Response) {
        try {
            console.log('Request received: GET /history');
        
            const transactions = await TransactionService.find({ ignored: false }),
                dict = {};

            transactions.forEach((transaction: Transaction) => {
                let week = dayjs(transaction.date).subtract(getTimezoneOffset('America/Edmonton'), 'minute').startOf('day');
                while (week.day() !== 1)
                    week = week.subtract(1, 'day');

                const weekLabel = week.format();
                if (!dict[weekLabel])
                    dict[weekLabel] = {
                        balance: Config.weeklyAmount(week.toDate())
                    };

                dict[weekLabel].balance -= transaction.amount;
            });

            const history = Object.keys(dict)
                .map((key: string) => ({ date: dayjs(key).toDate(), balance: dict[key].balance }))
                .sort((first, second) => dayjs(first.date).isBefore(second.date) ? 1 : -1);

            response.status(200).send(history);
        } catch (e) {
            console.log('Request failed: GET /history');
            console.error(e);
            response.status(500).send(e);
        }
    }

    private static async updateTransaction(request: Request, response: Response) {
        try {
            console.log('Request received: POST /transaction');

            await TransactionService.updateOne(Transaction.fromRaw(request.body));

            response.sendStatus(200);
        } catch (e) {
            console.log('Request failed: POST /transaction');
            console.error(e);
            response.status(500).send(e);
        }
    }

    private static async splitTransaction(request: Request, response: Response) {
        try {
            console.log('Request received: POST /transaction/split');

            const transaction = Transaction.fromRaw(request.body.transaction),
                newAmount = request.body.newAmount,
                copy = Transaction.copy(transaction);

            transaction.amount -= newAmount;
            copy.amount = newAmount;

            await Promise.all([
                TransactionService.updateOne(transaction),
                TransactionService.insertOne(copy)
            ]);

            response.sendStatus(200);
        } catch (e) {
            console.log('Request failed: POST /transaction/split');
            console.error(e);
            response.status(500).send(e);
        }
    }

    private static async getBalanceFromPreviousWeek(date: dayjs.Dayjs, transactions: Transaction[]) {
        let balance = await TransactionService.getBalance(date.toDate());

        if (balance === undefined && Config.isBalanceTransactionRequired(date)) {
            const offset = getTimezoneOffset('America/Edmonton');
            const transaction = new Transaction();
            transaction.balance = true;
            transaction.date = date.add(offset, 'minute').toDate();
            transaction.description = '(balance from previous week)';
            
            const previousTransactions = await TransactionService.getForWeek(date.subtract(1, 'week').toDate());
            transaction.amount = balance = -1 * (Config.weeklyAmount(date.subtract(1, 'week').toDate()) - previousTransactions
                .filter((transaction: Transaction) => !transaction.ignored && (transaction.tags || []).every((tag: Tag) => !tag.ignore))
                .map((transaction: Transaction) => transaction.amount)
                .reduce((sum: number, current: number) => sum + current, 0));
            
            await TransactionService.insertOne(transaction);
            transactions.push(transaction);
        } else if (balance === undefined) {
            balance = 0;
        }
        
        return balance;
    }
}