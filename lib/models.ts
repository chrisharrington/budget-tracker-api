import dayjs from 'dayjs';
import getTimezoneOffset from 'get-timezone-offset';

export class Id {
    _id: string;
}

export class Device extends Id {
    token: string;

    static fromRaw(raw: any) : Device {
        const device = new Device();
        device._id = raw._id;
        device.token = raw.token;
        return device;
    }
}

export class Budget {
    weeklyAmount: number;
    lastWeekRemaining: number;
    transactions: Transaction[];
    
    constructor(initializer: Partial<Budget>) {
        Object.assign(this, initializer);
    }
}

export class Transaction extends Id {
    amount: number;
    date: Date;
    description: string;
    owner: string;
    ignored: boolean;

    static fromRaw(raw: any) : Transaction {
        const transaction = new Transaction();
        transaction._id = raw._id;
        transaction.amount = raw.amount;
        transaction.date = new Date(raw.date);
        transaction.description = raw.description;
        transaction.owner = raw.owner;
        transaction.ignored = raw.ignored;
        return transaction;
    }

    static fromMessage(raw: string, date: Date) : Transaction {
        let parsed = raw.substring(raw.indexOf('$'));
        const words = parsed
            .substring(0, parsed.indexOf('<br><br>'))
            .replace('<sup>', '')
            .replace('</sup>', '')
            .replace('&#174;', '')
            .split(' ')
            .filter(w => w.trim().length > 0);

        const transaction = new Transaction();
        transaction.amount = parseFloat(words[0].replace('$', '').replace(',', ''));
        transaction.date = date;
        transaction.description = words.slice(words.indexOf('at')+1, words.lastIndexOf('on')).join(' ');
        transaction.owner = parsed.indexOf('0931') > -1 ? 'Sarah' : 'Chris';
        transaction.ignored = false;
        return transaction;
    }
}