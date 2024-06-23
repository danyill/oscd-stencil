import { css, html, LitElement, TemplateResult } from 'lit';

import { property, query, queryAll } from 'lit/decorators.js';

import '@material/mwc-tab-bar';

import '@material/web/button/outlined-button.js';
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

  @property() stencilData: Map<string, ControlBlockInfo> = new Map();

  @property() uniqueIeds: string[] = [];

  // items: SelectItem[] = [];

  @query('mwc-tab-bar') tabBarUI!: TabBar;

  @query('#output') outputStencilUI!: TextField;

  @query('#selection-dialog') iedSelector!: MdDialog;

  @query('#selection-list') selectionList!: SelectionList;

  @queryAll('#function > md-outlined-text-field')
  functionIedNames!: TextField[];

  saveStencil() {
    // need to do some validation

    const iedNameMapping = new Map<string, string>();
    this.functionIedNames.forEach(textField =>
      iedNameMapping.set(textField.dataset.ied!, textField.value)
    );

    console.log(iedNameMapping);

    const iedsJson = this.uniqueIeds.map(iedName => {
      const ied = this.doc.querySelector(`IED[name="${iedName}"]`)!;
      return `{"${iedNameMapping.get(iedName)}": {
          "originalName": "${ied.getAttribute('name')!}",
          "desc": "${ied.getAttribute('desc')!}"
          "type": "${ied.getAttribute('type')!}"
          "manufacturer": "${ied.getAttribute('manufacturer')!}"
          "configVersion": "${ied.getAttribute('configVersion')!}"
       }}`;
    });

    this.outputStencilUI.value = JSON.stringify({
      App1: {
        App2: {
          description: '???',
          IEDS: { ...iedsJson }
        }
      }
    });

    const outputText = this.outputStencilUI?.value ?? '';

    const blob = new Blob([outputText], {
      type: 'application/xml'
    });

    const a = document.createElement('a');
    a.download = `Stencil.json`;
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
    this.stencilData = new Map();
  }

  clearIedSelection(): void {
    if (this.selectionList) {
      (
        Array.from(
          this.selectionList.shadowRoot!.querySelectorAll(
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

      const searchField = (this.selectionList.shadowRoot!.querySelector(
        'md-outlined-text-field[placeholder="search"]'
      ) as MdOutlinedTextField)!;
      searchField.value = '';
      searchField.dispatchEvent(new Event('input'));
    }
  }

  renderCreate(): TemplateResult {
    return html`
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
          @click=${() => this.iedSelector.show()}
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

  // eslint-disable-next-line class-methods-use-this
  renderApplications(): TemplateResult {
    return html`<h1>Select Application</h1>`;
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
            this.iedSelector.close();
            this.clearIedSelection();
          }}"
          >Cancel</md-text-button
        >
        <md-text-button
          @click="${() => {
            const ieds: Element[] = this.selectionList.selectedElements;
            this.clearIedSelection();

            const iedNames = ieds.map(ied => ied.getAttribute('name'));

            const iedCombinations = Array.from(combinations(iedNames, 2));

            this.stencilData = new Map();
            iedCombinations.forEach(iedPairs => {
              // A to B
              const aDir = getMappingInfo(this.doc, iedPairs[0]!, iedPairs[1]!);
              aDir.forEach((value, key) => this.stencilData.set(key, value));
              // B to A

              const bDir = getMappingInfo(this.doc, iedPairs[1]!, iedPairs[0]!);
              bDir.forEach((value, key) => this.stencilData.set(key, value));

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
        <mwc-tab label="Use" icon="start" default stacked></mwc-tab>
        <mwc-tab label="Create" icon="construction" stacked></mwc-tab>
      </mwc-tab-bar>
      <section>
        ${this.tabIndex === 0 ? this.renderApplications() : this.renderCreate()}
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

    #appname,
    #appdesc {
      width: 400px;
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

// const iedNameToType = new Map<string, IedInfo>();
// Array.from(this.doc.querySelectorAll(':root > IED')).forEach(ied => {
//   const name = ied.getAttribute('name')!;
//   const type = ied.getAttribute('type');
//   const desc = ied.getAttribute('desc');
//   const manufacturer = ied.getAttribute('manufacturer');
//   const configVersion = ied.getAttribute('configVersion');
//   iedNameToType.set(name, {
//     desc,
//     type,
//     manufacturer,
//     configVersion
//   });
// });
// const ieds = Array.from(this.doc.querySelectorAll('IED')).filter(ied => {
//   const iedName = ied.getAttribute('name')!;
//   return [iedFrom].includes(iedNameToType.get(iedName)?.type ?? 'Unknown');
// });

// const iedInfo = new Map<string,ControlBlockInfo[]>();
// ieds.forEach(ied => {
//   const iedName = ied.getAttribute('name');

//   Array.from(ied.querySelectorAll(':scope Inputs > ExtRef'))

//     .filter(extref => {
//       const iedName = extref.getAttribute('iedName');
//       return (
//         iedName &&
//         [iedFrom].includes(iedName ?? 'Unknown') &&
//         isPublic(extref)
//       );
//     })
//     .forEach((extref: Element) => {

//       const ctrl = identity(sourceControlBlock(extref))
//       const data = {
//         from: iedName,
//         to: extref.getAttribute('iedName') ?? 'Unknown',
//       }
//       iedInfo.set(iedName)
//       console.log(identity(extref), );
//     });

// });

// getData(): void {
//   if (!this.doc) return;

//   const fromName = 'XAT_BusA_P2';
//   const toName = 'XAT_232_MU2';

//   const cbMappings = getMappingInfo(this.doc, fromName, toName);
//   const cbMappings2 = getMappingInfo(this.doc, toName, fromName);
// }

// protected firstUpdated(): void {
//   this.addEventListener('MDCTabBar:activated', event => {
//     console.log(event);
//   });
// }
