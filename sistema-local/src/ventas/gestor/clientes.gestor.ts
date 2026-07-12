import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Cliente } from '../modelo/cliente.entity';
import { CrearClienteDto } from '../dto/crear-cliente.dto';
import { ActualizarClienteDto } from '../dto/actualizar-cliente.dto';

/**
 * GESTOR (GRASP Controller). ABM de clientes: no hay lógica de negocio propia
 * más allá de guardar y buscar, así que solo orquesta el repositorio.
 */
@Injectable()
export class ClientesGestor {
  constructor(
    @InjectRepository(Cliente)
    private readonly clientes: Repository<Cliente>,
  ) {}

  crear(dto: CrearClienteDto): Promise<Cliente> {
    return this.clientes.save(this.clientes.create(dto));
  }

  buscar(nombre?: string): Promise<Cliente[]> {
    return this.clientes.find({
      where: nombre ? { razonSocial: ILike(`%${nombre}%`) } : {},
      order: { razonSocial: 'ASC' },
    });
  }

  async obtener(id: string): Promise<Cliente> {
    const cliente = await this.clientes.findOne({ where: { id } });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return cliente;
  }

  async actualizar(id: string, dto: ActualizarClienteDto): Promise<Cliente> {
    await this.obtener(id);
    await this.clientes.update(id, dto);
    return this.obtener(id);
  }
}
