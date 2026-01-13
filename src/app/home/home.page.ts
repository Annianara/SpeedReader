import {Component, computed, effect, HostListener, OnInit, signal, WritableSignal} from '@angular/core';
import {
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonSelect,
  IonSelectOption
} from '@ionic/angular/standalone';
import {Directory, Encoding, Filesystem} from "@capacitor/filesystem";
import {Preferences} from "@capacitor/preferences";
import {NgForOf, NgIf} from "@angular/common";
import {FormsModule} from "@angular/forms";

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, IonButton, NgIf, IonSelect, IonSelectOption, NgForOf, FormsModule, IonFab, IonFabButton, IonIcon],
})
export class HomePage implements OnInit {
  bookChapters: WritableSignal<{ title: string, textArr: string[] }[]> = signal([]) // массив слов глав книги
  position: WritableSignal<{ chapterNumber: number, position: number }> = signal({chapterNumber: 0, position: 0}) // позиция текста
  speed: WritableSignal<number> = signal(100) // скорость текста
  isBookLoading = signal(false); // книга загружается
  isReadingLaunched = signal(false); // запущена ли книга

  chapterList = computed(() => {
    return this.bookChapters?.().map((bookChapter, index) => {
      return index
    })
  }) // выбор глав для селекта

  intervalId?: any; // ид интервала
  bookName: string = ''; // название книги

  @HostListener('document:keydown.space', ['$event'])
  onSpace(event: KeyboardEvent) {
    event.preventDefault(); // если не нужен скролл
    this.toggleReading();
  }

  constructor() {
    effect(async () => {
      if (this.bookChapters().length > 0) {
        Filesystem.writeFile({
          path: `books/main.txt`,
          data: JSON.stringify(this.bookChapters()),
          directory: Directory.Data,
          encoding: Encoding.UTF8
        }).then(() => {
          }
        );
      }
    })

    effect(() => {
      if (this.position().position != 0 || this.position().chapterNumber != 0) {
        Preferences.set({
          key: `book:main:position`,
          value: JSON.stringify(this.position())
        }).then(() => {
        });
      }
    });

    effect(() => {
      if (this.speed() !== 100) {
        Preferences.set({
          key: `book:main:speed`,
          value: this.speed().toString() ?? '',
        }).then(() => {
        });
      }
    })
  }

  async ngOnInit() {
    this.isBookLoading.set(true);

    const position = await Preferences.get({key: 'book:main:position'});
    if (position.value) {
      this.position.set(JSON.parse(position.value!))
    }

    const speed = await Preferences.get({key: 'book:main:speed'});
    if (speed.value) {
      this.speed.set(JSON.parse(speed.value!));
    }

    const bookExists = await this.fileExists(`books/main.txt`);
    if (bookExists) {
      Filesystem.readFile({
        path: `books/main.txt`,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      }).then((data) => {
        if (data) {
          this.bookChapters.set(JSON.parse(data.data.toString()))
          this.isBookLoading.set(false);
        }
      })
    } else {
      this.isBookLoading.set(false);
    }
  }

  /**
   * Выбрать главу
   * @param $event
   */
  chooseChapter($event: any) {
    this.position.set({chapterNumber: $event.target.value, position: 0})
  }

  /**
   * Действия после загрузки книги
   * @param event
   */
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.bookName = 'main';
    const reader = new FileReader();

    reader.onload = async () => {
      const fb2Text = reader.result as string;
      const fullDir = 'books';
      if (!(await this.dirExists(fullDir))) {
        await Filesystem.mkdir({
          path: fullDir,
          directory: Directory.Data,
          recursive: true,
        });
      } else {
      }
      this.position.set({chapterNumber: 0, position: 0});
      this.bookChapters.set(this.fb2ToArr(fb2Text));
      this.nextWord();
    };

    reader.readAsText(file);
  }

  /**
   * Преобразовать текст фб2 в массив слов
   * @param fb2
   */
  fb2ToArr(fb2: string) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(fb2, 'application/xml');
    const bookChapters: { title: string, textArr: string[]; }[] = [];
    Array.from(
      xml.querySelectorAll('body:first-of-type section:has(title)')
    ).map((chapter) => {
      bookChapters.push({
        title: chapter.querySelector('title p')?.textContent?.trim() ?? '',
        textArr: Array.from(
          chapter.querySelectorAll('title p, & > p')
        ).map(p => p.textContent?.trim())
          .filter(Boolean)
          .map(string => {
            let end = false;
            let position = 0;
            const arr = [];
            while (!end) {
              const match = string.slice(position).match('\\s+');
              let endWordIndex = match ? position + match.index! : -1;
              if (endWordIndex == -1) {
                end = true;
                // если нет пробела, берем все слово до конца
                arr.push(string.slice(position))
              } else {
                arr.push(string.slice(position, endWordIndex))
                position = match ? position + match.index! + match[0].length : -1;
              }
            }
            return arr;
          })
          .flat()
      });
    });
    return bookChapters;
  }

  /**
   * Увеличить скорость
   */
  increaseSpeed() {
    this.stopReading()
    this.speed.update((v) => v + 50);
  }

  /**
   * Уменьшить скорость
   */
  decreaseSpeed() {
    this.stopReading()
    this.speed.update((v) => v - 50);
  }

  /**
   * Начать чтение
   */
  startReading() {
    this.isReadingLaunched.set(true)
    this.intervalId = setInterval(() => {
      this.nextWord();
    }, 1 / (this.speed() / 60) * 1000
    )
  }

  /**
   * Остановить чтение
   */
  stopReading() {
    this.isReadingLaunched.set(false);
    clearInterval(this.intervalId)
  }

  /**
   * Переключить стоп или старт
   */
  toggleReading() {
    if (this.isReadingLaunched()) {
      this.stopReading();
    } else {
      this.startReading();
    }
  }

  /**
   * Поставить позицию на следующее слово
   */
  nextWord() {
    if (this.bookChapters()[this.position().chapterNumber].textArr.length - 1 > this.position().position) {
      this.position.update(p => {
          return {
            chapterNumber: p.chapterNumber,
            position: p.position + 1
          }
        }
      );
    } else {
      if (this.position().chapterNumber + 1 <= this.bookChapters().length - 1) {
        this.position.update(p => {
            return {
              chapterNumber: p.chapterNumber + 1,
              position: 0
            }
          }
        )
      }
    }
  }

  /**
   * Поставить позицию на предыдущее слово
   */
  previousWord() {
    if (this.position().position > 0) {
      this.position.update(p => {
          return {
            chapterNumber: p.chapterNumber,
            position: p.position - 1
          }
        }
      );
    } else {
      if (this.position().chapterNumber > 0) {
        this.position.update(p => {
            return {
              chapterNumber: p.chapterNumber - 1,
              position: this.bookChapters()[p.chapterNumber - 1].textArr.length - 1
            }
          }
        )
      }
    }
  }

  /**
   * Проверить, что файл существует
   * @param path
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({
        path,
        directory: Directory.Data
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Проверить, что директория существует
   * @param path
   */
  async dirExists(path: string): Promise<boolean> {
    try {
      const stat = await Filesystem.stat({
        path,
        directory: Directory.Data,
      });
      return stat.type === 'directory';
    } catch {
      return false;
    }
  }

}
