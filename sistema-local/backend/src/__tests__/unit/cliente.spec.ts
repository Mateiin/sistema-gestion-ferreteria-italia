import {
  Cliente,
  CondicionIvaCliente,
} from '../../ventas/modelo/cliente.entity';

describe('Cliente', () => {
  describe('tipoFacturaCorrespondiente', () => {
    it('Responsable Inscripto → Factura A', () => {
      const cliente = new Cliente();
      cliente.condicionIva = CondicionIvaCliente.RESPONSABLE_INSCRIPTO;
      expect(cliente.tipoFacturaCorrespondiente()).toBe('A');
    });

    it('Monotributo → Factura B', () => {
      const cliente = new Cliente();
      cliente.condicionIva = CondicionIvaCliente.MONOTRIBUTO;
      expect(cliente.tipoFacturaCorrespondiente()).toBe('B');
    });

    it('Exento → Factura B', () => {
      const cliente = new Cliente();
      cliente.condicionIva = CondicionIvaCliente.EXENTO;
      expect(cliente.tipoFacturaCorrespondiente()).toBe('B');
    });

    it('Consumidor Final → Factura B', () => {
      const cliente = new Cliente();
      cliente.condicionIva = CondicionIvaCliente.CONSUMIDOR_FINAL;
      expect(cliente.tipoFacturaCorrespondiente()).toBe('B');
    });
  });
});
