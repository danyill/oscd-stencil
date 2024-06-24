import { css, html, LitElement, TemplateResult } from 'lit';

import { property, query, queryAll } from 'lit/decorators.js';

import '@material/mwc-tab-bar';

import '@material/web/button/outlined-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/checkbox/checkbox.js';
import '@material/web/dialog/dialog.js';

import '@material/web/icon/icon.js';

import '@openenergytools/filterable-lists/dist/selection-list.js';

import type { MdCheckbox } from '@material/web/checkbox/checkbox.js';
import type { TabBar } from '@material/mwc-tab-bar';
import type { TextField } from '@material/web/textfield/internal/text-field.js';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field.js';
import type { SelectionList } from '@openenergytools/filterable-lists/dist/selection-list.js';

import defaultStencil from './default_stencil.json' with { type: 'json' };

import {
  ControlBlockInfo,
  getMappingInfo
} from './foundation/getMappingInfo.js';

function getIedDescription(ied: Element): {
  firstLine: string;
  secondLine: string;
} {
  const [
    manufacturer,
    type,
    desc,
    configVersion,
    originalSclVersion,
    originalSclRevision,
    originalSclRelease
  ] = [
    'manufacturer',
    'type',
    'desc',
    'configVersion',
    'originalSclVersion',
    'originalSclRevision',
    'originalSclRelease'
  ].map(attr => ied?.getAttribute(attr));

  const firstLine = [manufacturer, type]
    .filter(val => val !== null)
    .join(' - ');

  const schemaInformation = [
    originalSclVersion,
    originalSclRevision,
    originalSclRelease
  ]
    .filter(val => val !== null)
    .join('');

  const secondLine = [desc, configVersion, schemaInformation]
    .filter(val => val !== null)
    .join(' - ');

  return { firstLine, secondLine };
}

// from https://stackoverflow.com/questions/43241174/javascript-generating-all-combinations-of-elements-in-a-single-array-in-pairs
function* combinations<T>(array: T[], length: number): IterableIterator<T[]> {
  for (let i = 0; i < array.length; i += 1) {
    if (length === 1) {
      yield [array[i]];
    } else {
      const remaining = combinations(
        array.slice(i + 1, array.length),
        length - 1
      );
      for (const next of remaining) {
        yield [array[i], ...next];
      }
    }
  }
}

// not exported: removeSubscriptionSupervision

// import '@material/mwc-fab';
// import '@material/mwc-icon';
// import '@material/mwc-icon-button-toggle';
// import '@material/mwc-list';
// import '@material/mwc-list/mwc-list-item';
// import '@material/mwc-list/mwc-check-list-item';
// import '@material/mwc-list/mwc-radio-list-item';
// import '@material/mwc-menu';

// type IedInfo = {
//   desc: string | null;
//   type: string | null;
//   manufacturer: string | null;
//   configVersion: string | null;
// };

// type ied = {
//   [name: string]: {
//     originalName: string;
//     desc: string;
//     type: string;
//     manufacturer: string;
//     configVersion: string;
//   };
// };

// type stencilData = {
//   description: string;
//   version: string;
//   applications: {
//     [category: string]: {
//       [name: string]: {
//         description: string;
//         IEDS: { [key: string]: ied };
//       };
//     };
//   };
// };

/**
 * A plugin to allow templates of GOOSE and SV using the
 * later binding method based on a JSON description of a configuration.
 */
export default class Stencil extends LitElement {
  @property({ attribute: false })
  doc!: XMLDocument;

  @property() docName!: string;

  @property() editCount!: number;

  @property() tabIndex: number = 0;

  @property() iedMappingStencilData: Map<string, ControlBlockInfo> = new Map();

  @property() uniqueIeds: string[] = [];

  @property() stencilData: JSON;

  // items: SelectItem[] = [];

  @query('mwc-tab-bar') tabBarUI!: TabBar;

  @query('#output') outputStencilUI!: TextField;

  @query('#appcat') appCategory!: TextField;

  @query('#appname') appName!: TextField;

  @query('#appdesc') appDesc!: TextField;

  @query('#stendesc') stencilDesc!: TextField;

  @query('#stenver') stencilVersion!: TextField;

  @query('#selection-dialog') iedSelectorUI!: MdDialog;

  @query('#selection-list') selectionListUI!: SelectionList;

  @query('#changeStencil') changeStenciLUI!: HTMLInputElement;

  @queryAll('#function > md-outlined-text-field')
  functionIedNamesUI!: TextField[];

  constructor() {
    super();
    this.stencilData = defaultStencil;
  }

  saveStencil() {
    // need to do some validation

    const iedNameMapping = new Map<string, string>();
    this.functionIedNamesUI.forEach(textField =>
      iedNameMapping.set(textField.dataset.ied!, textField.value)
    );

    const iedsJson = this.uniqueIeds.map(iedName => {
      const ied = this.doc.querySelector(`IED[name="${iedName}"]`)!;
      return {
        [iedNameMapping.get(iedName) ?? 'Unknown IED']: {
          originalName: ied.getAttribute('name')!,
          desc: ied.getAttribute('desc')!,
          type: ied.getAttribute('type')!,
          manufacturer: ied.getAttribute('manufacturer')!,
          configVersion: ied.getAttribute('configVersion')!
        }
      };
    });

    this.stencilData = {
      description: this.stencilDesc.value,
      version: this.stencilVersion.value,
      applications: {
        [this.appCategory.value ?? 'UnknownCategory']: {
          [this.appName.value ?? 'UnknownName']: {
            description: this.appDesc.value,
            IEDS: iedsJson,
            ControlBlocks: Object.fromEntries(
              this.iedMappingStencilData.entries()
            )
          }
        }
      }
    };

    const outputText = JSON.stringify(this.stencilData, null, 2);

    const blob = new Blob([outputText], {
      type: 'application/xml'
    });

    const a = document.createElement('a');
    a.download = `${this.stencilDesc.value.replace(' ', '_')}_${
      this.stencilVersion.value
    }.json`;

    a.href = URL.createObjectURL(blob);
    a.dataset.downloadurl = ['application/json', a.download, a.href].join(':');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(a.href);
    }, 5000);

    this.clearStencilCreateData();
  }

  clearStencilCreateData(): void {
    this.uniqueIeds = [];
    this.iedMappingStencilData = new Map();
  }

  clearIedSelection(): void {
    if (this.selectionListUI) {
      (
        Array.from(
          this.selectionListUI.shadowRoot!.querySelectorAll(
            'md-list.listitems md-list-item md-checkbox'
          )
        ) as MdCheckbox[]
      ).forEach((cb): void => {
        if (cb.checked) {
          // eslint-disable-next-line no-param-reassign
          cb.checked = false;
          cb.dispatchEvent(new Event('change'));
          cb.requestUpdate();
        }
      });

      const searchField = (this.selectionListUI.shadowRoot!.querySelector(
        'md-outlined-text-field[placeholder="search"]'
      ) as MdOutlinedTextField)!;
      searchField.value = '';
      searchField.dispatchEvent(new Event('input'));
    }
  }

  async loadStencil(event: Event): Promise<void> {
    const file = (<HTMLInputElement | null>event.target)?.files?.item(0);
    if (!file) return;

    const text = await file.text();
    this.stencilData = JSON.parse(text);

    this.changeStenciLUI.onchange = null;
  }

  renderUse(): TemplateResult {
    console.log(defaultStencil);
    return html`
      <div>
        <h1 id="stencilName">
          ${this.stencilData.description}<code id="stencilVersion"
            >${defaultStencil.version}</code
          >
        </h1>
        <span style="position: relative">
          <md-filled-button
            id="more"
            @click=${() => {
              this.changeStenciLUI.click();
            }}
            >Change Stencil
            <md-icon slot="icon">file_open</md-icon>
          </md-filled-button>
        </span>
      </div>

      <h2>Select Application</h2>
      <input
        id="changeStencil"
        @click=${({ target }: MouseEvent) => {
          // eslint-disable-next-line no-param-reassign
          (<HTMLInputElement>target).value = '';
        }}
        @change=${this.loadStencil}
        type="file"
      />
    `;
  }

  renderCreate(): TemplateResult {
    return html`
      <h1>Enter Stencil Data</h1>
      <div class="group appinf">
        <md-outlined-text-field
          id="stendesc"
          label="Description"
          value="Transpower Stencil"
        >
        </md-outlined-text-field>
        <md-outlined-text-field id="stenver" label="Version" value="1.0.0">
        </md-outlined-text-field>
      </div>
      <h1>Enter Application Data</h1>
      <div class="group appinf">
        <md-outlined-text-field
          id="appcat"
          label="Category"
          value="Bus Protection"
        >
        </md-outlined-text-field>
        <md-outlined-text-field
          id="appname"
          label="Name"
          value="Protection 2 (7SS85) to MUs"
        >
        </md-outlined-text-field>
        <md-outlined-text-field
          id="appdesc"
          label="Description"
          value="Configure MUs and Bus Protection"
        >
        </md-outlined-text-field>
      </div>
      <div class="group">
        <md-outlined-button
          class="button"
          @click=${() => this.iedSelectorUI.show()}
          >Add IEDs
          <md-icon slot="icon">developer_board</md-icon>
        </md-outlined-button>
      </div>
      <div class="group appinf" id="function">
        ${this.uniqueIeds.map(
          ied =>
            html`<md-outlined-text-field
              class="iedfunction"
              data-ied="${ied}"
              label="IED Function (was ${ied})"
              value="${ied}"
            ></md-outlined-text-field>`
        )}
      </div>
      <md-outlined-button class="button" @click=${() => this.saveStencil()}
        >Add Application
        <md-icon slot="icon">draw_collage</md-icon>
      </md-outlined-button>
      <div class="output">
        <md-outlined-text-field
          id="output"
          type="textarea"
          label="Stencil Output File"
          value="${this.stencilData}"
          rows="10"
        >
        </md-outlined-text-field>
        <md-outlined-button class="button" @click=${() => this.saveStencil()}
          >Download
          <md-icon slot="icon">download</md-icon>
        </md-outlined-button>
      </div>
    `;
  }

  renderIedSelector(): TemplateResult {
    return html`<md-dialog
      id="selection-dialog"
      @cancel=${(event: Event) => {
        event.preventDefault();
        // this.clearSelection();
      }}
    >
      <form slot="content" id="selection" method="dialog">
        <selection-list
          id="selection-list"
          .items=${Array.from(this.doc?.querySelectorAll('IED') ?? []).map(
            ied => {
              const { firstLine, secondLine } = getIedDescription(ied);

              return {
                headline: `${ied.getAttribute('name')!} — ${firstLine}`,
                supportingText: secondLine,
                attachedElement: ied,
                selected: false
              };
            }
          )}
          filterable
        ></selection-list>
      </form>
      <div slot="actions">
        <md-text-button
          @click="${() => {
            this.iedSelectorUI.close();
            this.clearIedSelection();
          }}"
          >Cancel</md-text-button
        >
        <md-text-button
          @click="${() => {
            const ieds: Element[] = this.selectionListUI.selectedElements;
            this.clearIedSelection();

            const iedNames = ieds.map(ied => ied.getAttribute('name'));

            const iedCombinations = Array.from(combinations(iedNames, 2));

            this.iedMappingStencilData = new Map();
            iedCombinations.forEach(iedPairs => {
              // A to B
              const aDir = getMappingInfo(this.doc, iedPairs[0]!, iedPairs[1]!);
              aDir.forEach((value, key) =>
                this.iedMappingStencilData.set(key, value)
              );
              // B to A

              const bDir = getMappingInfo(this.doc, iedPairs[1]!, iedPairs[0]!);
              bDir.forEach((value, key) =>
                this.iedMappingStencilData.set(key, value)
              );

              Array.from(aDir.values()).forEach((val: ControlBlockInfo) => {
                if (!this.uniqueIeds.includes(val.to))
                  this.uniqueIeds.push(val.to);
                if (!this.uniqueIeds.includes(val.to))
                  this.uniqueIeds.push(val.from);
              });

              Array.from(bDir.values()).forEach((val: ControlBlockInfo) => {
                if (!this.uniqueIeds.includes(val.to))
                  this.uniqueIeds.push(val.to);
                if (!this.uniqueIeds.includes(val.to))
                  this.uniqueIeds.push(val.from);
              });
            });
            // console.log(this.uniqueIeds);
            // console.log(this.stencilData);
          }}"
          form="selection"
          >Add IEDs</md-text-button
        >
      </div></md-dialog
    >`;
  }

  render(): TemplateResult {
    return html`<mwc-tab-bar
        @MDCTabBar:activated=${({
          detail: { index }
        }: {
          detail: { index: number };
        }) => {
          this.tabIndex = index;
        }}
      >
        <mwc-tab label="Use" icon="stadia_controller" default stacked></mwc-tab>
        <mwc-tab label="Create" icon="construction" stacked></mwc-tab>
      </mwc-tab-bar>
      <section>
        ${this.tabIndex === 0 ? this.renderUse() : this.renderCreate()}
      </section>
      ${this.renderIedSelector()}`;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;

      --secondaryThemeFallback: #018786;
      --scrollbarBG: var(--mdc-theme-background, #cfcfcf00);
      --thumbBG: var(--mdc-button-disabled-ink-color, #996cd8cc);
    }

    h1,
    h2,
    h3 {
      color: var(--mdc-theme-on-surface);
      font-family: 'Roboto', sans-serif;
      font-weight: 300;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      margin: 0px;
      line-height: 48px;
      padding-left: 0.3em;
    }

    mwc-tab-bar,
    #output {
      width: 100%;
      display: block;
      margin-top: 20px;
    }

    #stencilName {
      width: 100%;
    }

    #appname,
    #appdesc,
    #stendesc {
      width: 400px;
    }

    #stencilVersion {
      padding: 10px;
    }

    #changeStencil {
      display: none;
    }

    .iedfunction {
      width: 300px;
    }

    .button,
    .appinf > md-outlined-text-field {
      margin: 10px;
    }

    .group {
      display: flex;
      flex-direction: row;
    }

    section {
      position: relative;
      max-height: 100%;
      background-color: var(--mdc-theme-surface, #fafafa);
      padding: 12px;
    }
  `;
}
