import { Injectable } from "@nestjs/common";
import { IntervalShowed } from "src/media/dto/interval-showed.interface";

@Injectable({})
export class VerifTimerShowService {

  public convertTimerInSecond(timer: string): number {
    if (timer) {
      const time: string[] = this.getGoodFormat(timer).split(':');
      if (time.length >= 3) {
        const [hour, minute, second] = time;
        const totalSeconds = parseInt(hour) * 3600 + parseInt(minute) * 60 + parseInt(second);
        if (totalSeconds > 0) {
          return totalSeconds;
        } else {
          return 90;
        }
      } else {
        return 90;
      }
    } else {
      return 90;
    }
  }

  public convertSecondInGoodFormatTimer(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0')
    ].join(':');
  }

  public getGoodFormat(time: string): string {
    let timerTab: string[] = [];
    if (time && time != undefined) {
      timerTab = time.split(':');
    }
    if (timerTab.length === 3) {
      return time;
    } else {
      return '00:00:00';
    }
  }

  public getGoodIntervalWhenMovieShowed(start: string, end: string): IntervalShowed {
    const defaultStart: string = this.convertSecondInGoodFormatTimer(1200);
    const defaultEnd: string = this.convertSecondInGoodFormatTimer(1290);

    if (start == null || end == null) {
      return { start: defaultStart, end: defaultEnd };
    }

    start = this.getGoodFormat(start);
    end = this.getGoodFormat(end);

    let secondStart: number = this.convertTimerInSecond(start);
    let secondEnd: number = this.convertTimerInSecond(end);

    if (secondStart <= 0) {
      secondStart = 90;
    }

    if (secondStart >= secondEnd) {
      secondEnd = secondStart + 90;
    }

    return {
      start: this.convertSecondInGoodFormatTimer(secondStart),
      end: this.convertSecondInGoodFormatTimer(secondEnd)
    };
  }

}
