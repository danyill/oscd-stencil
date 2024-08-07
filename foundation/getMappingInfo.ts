import {
  controlBlockObjRef,
  findControlBlockSubscription,
  identity,
  matchDataAttributes
} from '@openenergytools/scl-lib';

type Mapping = {
  FCDA: string;
  ExtRef: string;
};

export type ControlBlockInfo = {
  id: string;
  name: string;
  from: string;
  to: string;
  baseFrom?: string;
  baseTo?: string;
  type: string;
  mappings: Mapping[];
  supervision: string;
};

/**
 * Check if the ExtRef is already subscribed to a FCDA Element.
 *
 * @param extRef - The Ext Ref Element to check.
 */
function isSubscribed(extRef: Element): boolean {
  return (
    extRef.hasAttribute('iedName') &&
    extRef.hasAttribute('ldInst') &&
    extRef.hasAttribute('lnClass') &&
    extRef.hasAttribute('lnInst') &&
    extRef.hasAttribute('doName')
  );
}

function getFCDA(cb: Element, extRef: Element): Element | undefined {
  const dsName = cb.getAttribute('datSet');
  const ds = cb.closest('LN0')!.querySelector(`DataSet[name="${dsName}"]`);
  return Array.from(ds!.querySelectorAll('FCDA')).find((fcda: Element) =>
    matchDataAttributes(extRef, fcda)
  );
}

function findSupervision(cb: Element, ied: Element): Element | undefined {
  const lnClass = cb.tagName === 'GSEControl' ? 'LGOS' : 'LSVS';
  const cbRefType = lnClass === 'LGOS' ? 'GoCBRef' : 'SvCBRef';

  return (
    Array.from(
      ied.querySelectorAll(
        `LN[lnClass="${lnClass}"] > DOI[name="${cbRefType}"] > DAI[name="setSrcRef"] > Val`
      )
    )
      .find(val => val.textContent === controlBlockObjRef(cb))
      ?.closest('LN') ?? undefined
  );
}

function identityNoIed(element: Element | null, iedName: string): string {
  if (element === null) return 'NONE';
  return `${identity(element)}`.substring(iedName.length);
}

// function identityNoIed(element: Element | null): string {
//     if (element === null) return 'NONE';
//     const id = `${identity(element)}`;
//     return id.substring(id.indexOf('>') + 1);
//   }

export function getMappingInfo(
  doc: XMLDocument,
  fromName: string,
  toName: string
): ControlBlockInfo[] {
  const fromIed = doc.querySelector(`:root > IED[name="${fromName}"`)!;

  const controlBlocks = Array.from(
    fromIed.querySelectorAll('GSEControl, SampledValueControl')
  );

  const cbMappings: ControlBlockInfo[] = [];

  controlBlocks.forEach((cb: Element) => {
    const extRefMappings = findControlBlockSubscription(cb)
      .filter(
        extRef =>
          extRef.closest('IED')!.getAttribute('name') === toName &&
          isSubscribed(extRef)
      )
      .map(extRef => ({
        FCDA: identityNoIed(getFCDA(cb, extRef) ?? null, fromName),
        ExtRef: identityNoIed(extRef, toName)
      }));
    if (extRefMappings.length) {
      const toIed = doc.querySelector(`:root > IED[name="${toName}"`)!;
      const supLn = findSupervision(cb, toIed) ?? null;

      cbMappings.push({
        id: `${identityNoIed(cb, fromName)}`,
        name: cb.getAttribute('name')!,
        from: fromName,
        to: toName,
        type: cb.tagName,
        mappings: extRefMappings,
        supervision: supLn ? `${identityNoIed(supLn, toName)}` : 'None'
      });
    }
  });
  return cbMappings;
}
